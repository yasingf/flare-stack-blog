import {
  createChallenge,
  randomInt,
  verifySolution,
  type Payload,
} from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { serverEnv } from "@/lib/env/server.env";
import { getRateLimiter } from "@/lib/do/rate-limiter-binding";
import { enforceIpRateLimit } from "./rate-limit";
import { enforceTurnstile } from "./turnstile";

export function authVerificationProvider(request: Request, env: Env) {
  // Only trusted Workers request metadata determines region. Never accept a
  // client country header, query parameter, language or browser time zone.
  if (request.cf?.country === "CN") return "altcha" as const;
  return serverEnv(env).TURNSTILE_SECRET_KEY
    ? ("turnstile" as const)
    : ("none" as const);
}
async function clientBinding(request: Request, env: Env) {
  const secret = serverEnv(env).BETTER_AUTH_SECRET;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(
      `auth-verification:${request.headers.get("cf-connecting-ip") || "local"}`,
    ),
  );
  return [...new Uint8Array(bytes)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export async function handleVerificationInfo(request: Request, env: Env) {
  return Response.json(
    { provider: authVerificationProvider(request, env) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function createAuthChallenge(request: Request, env: Env) {
  if (authVerificationProvider(request, env) !== "altcha")
    return new Response(null, { status: 403 });
  const limit = await enforceIpRateLimit(request, {
    capacity: 10,
    interval: "1m",
    key: "auth:challenge",
  });
  if (limit) return limit;
  const hourly = await enforceIpRateLimit(request, {
    capacity: 30,
    interval: "1h",
    key: "auth:challenge:hour",
  });
  if (hourly) return hourly;
  const challenge = await createChallenge({
    algorithm: "PBKDF2/SHA-256",
    cost: 2000,
    counter: randomInt(1000, 2000),
    deriveKey,
    expiresAt: new Date(Date.now() + 300000),
    data: { client: await clientBinding(request, env), scope: "auth" },
    hmacSignatureSecret: `${serverEnv(env).BETTER_AUTH_SECRET}:regional-auth`,
  });
  return Response.json(challenge, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function enforceAuthVerification(
  request: Request,
  env: Env,
): Promise<Response | null> {
  if (authVerificationProvider(request, env) !== "altcha")
    return enforceTurnstile(env, request);
  const token = request.headers.get("X-Turnstile-Token") || "";
  const deny = () =>
    Response.json(
      {
        code: "TURNSTILE_VERIFICATION_FAILED",
        message: "本站验证已失效，请重新验证。",
      },
      { status: 403 },
    );
  if (!token.startsWith("altcha:") || token.length > 8192) return deny();
  try {
    const payload = JSON.parse(atob(token.slice(7))) as Payload;
    const p = payload.challenge?.parameters;
    // Bound untrusted work before calling the verifier; never let a supplied
    // cost/algorithm ask the Worker to perform expensive key derivation.
    if (
      !p ||
      p.algorithm !== "PBKDF2/SHA-256" ||
      p.cost !== 2000 ||
      p.keyLength !== 32 ||
      !/^[a-f0-9]{32}$/.test(p.nonce) ||
      !/^[a-f0-9]{32}$/.test(p.salt) ||
      !/^[a-f0-9]{32}$/.test(p.keyPrefix) ||
      !/^[a-f0-9]{64}$/.test(payload.challenge.signature || "") ||
      p.data?.scope !== "auth" ||
      p.data.client !== (await clientBinding(request, env)) ||
      !Number.isInteger(p.expiresAt) ||
      p.expiresAt! * 1000 <= Date.now() ||
      p.expiresAt! * 1000 > Date.now() + 301000
    )
      return deny();
    const result = await verifySolution({
      ...payload,
      deriveKey,
      hmacSignatureSecret: `${serverEnv(env).BETTER_AUTH_SECRET}:regional-auth`,
    });
    if (!result.verified) return deny();
    // Capacity one refills only after the signed challenge has already expired.
    // A Durable Object makes simultaneous replay attempts atomic across PoPs.
    const once = await (
      await getRateLimiter(`auth-proof:${p.nonce}`)
    ).checkLimit({ capacity: 1, interval: "10m" });
    return once.allowed ? null : deny();
  } catch {
    return deny();
  }
}
