import { getAuth } from "@/lib/auth/auth.server";
import { getDb } from "@/lib/db";
import { enforceIpRateLimit } from "./rate-limit";
import {
  createAuthChallenge,
  enforceAuthVerification,
  handleVerificationInfo,
} from "./auth-verification";

const TURNSTILE_PROTECTED_PATHS = new Set([
  "/api/auth/sign-in/email",
  "/api/auth/sign-up/email",
  "/api/auth/request-password-reset",
  "/api/auth/send-verification-email",
]);

export async function handleAuthRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (request.method === "GET" && pathname === "/api/auth/verification")
    return handleVerificationInfo(request, env);
  if (request.method === "GET" && pathname === "/api/auth/challenge")
    return createAuthChallenge(request, env);

  if (
    request.method === "GET" &&
    [
      "/api/auth/passkey/generate-authenticate-options",
      "/api/auth/passkey/generate-register-options",
    ].includes(pathname)
  ) {
    const limit = await enforceIpRateLimit(request, {
      capacity: 10,
      interval: "1m",
      key: "auth:passkey:challenge",
    });
    if (limit) return limit;
  }

  if (request.method === "POST") {
    if (TURNSTILE_PROTECTED_PATHS.has(pathname)) {
      const minuteLimit = await enforceIpRateLimit(request, {
        capacity: 5,
        interval: "1m",
        key: `auth:${pathname}:1m`,
      });
      if (minuteLimit) return minuteLimit;

      const hourlyLimit = await enforceIpRateLimit(request, {
        capacity: 10,
        interval: "1h",
        key: `auth:${pathname}:1h`,
      });
      if (hourlyLimit) return hourlyLimit;
      const verificationResponse = await enforceAuthVerification(request, env);
      if (verificationResponse) return verificationResponse;
    } else {
      const minuteLimit = await enforceIpRateLimit(request, {
        capacity: 5,
        interval: "1m",
        key: `auth:${pathname}:1m`,
      });
      if (minuteLimit) return minuteLimit;
    }
  }

  const db = getDb(env);
  const auth = getAuth({ db, env });
  return auth.handler(request);
}
