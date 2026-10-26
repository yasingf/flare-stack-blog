import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { solveChallenge, type Challenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import {
  authVerificationProvider,
  createAuthChallenge,
  enforceAuthVerification,
} from "./auth-verification";

function request(country: string, token?: string, ip = "192.0.2.3") {
  return new Request("https://example.com/api/auth/sign-in/email", {
    method: "POST",
    cf: { country },
    headers: {
      "cf-connecting-ip": ip,
      ...(token ? { "X-Turnstile-Token": token } : {}),
    },
  });
}
describe("regional authentication verification", () => {
  it("uses trusted country metadata and never trusts a spoofed region header", async () => {
    const configured = { ...env, TURNSTILE_SECRET_KEY: "configured" };
    expect(authVerificationProvider(request("CN"), configured)).toBe("altcha");
    expect(authVerificationProvider(request("US"), configured)).toBe(
      "turnstile",
    );
    const spoofed = request("US");
    spoofed.headers.set("cf-ipcountry", "CN");
    expect(authVerificationProvider(spoofed, configured)).toBe("turnstile");
    expect((await createAuthChallenge(spoofed, configured)).status).toBe(403);
    expect(
      (await enforceAuthVerification(request("CN"), configured))?.status,
    ).toBe(403);
  });
  it("verifies proof of work, binds it to the IP and consumes it only once under concurrency", async () => {
    const source = request("CN");
    const response = await createAuthChallenge(source, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const challenge = (await response.json()) as Challenge;
    const solution = await solveChallenge({ challenge, deriveKey });
    expect(solution).not.toBeNull();
    const token = `altcha:${btoa(JSON.stringify({ challenge, solution }))}`;
    expect(
      (await enforceAuthVerification(request("CN", token, "192.0.2.4"), env))
        ?.status,
    ).toBe(403);
    const forged = structuredClone(challenge);
    forged.parameters.cost = 1;
    expect(
      (
        await enforceAuthVerification(
          request(
            "CN",
            `altcha:${btoa(JSON.stringify({ challenge: forged, solution }))}`,
          ),
          env,
        )
      )?.status,
    ).toBe(403);
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        enforceAuthVerification(request("CN", token), env),
      ),
    );
    expect(results.filter((x) => x === null)).toHaveLength(1);
    expect(results.filter((x) => x?.status === 403)).toHaveLength(2);
  });
});
