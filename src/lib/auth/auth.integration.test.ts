import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { createTestContext } from "tests/test-utils";
import { describe, expect, it } from "vitest";
import { getAuth } from "@/lib/auth/auth.server";
import { user } from "@/lib/db/schema";

describe("first User is Admin", () => {
  it("assigns admin to the first created User only", async () => {
    const context = createTestContext();
    const auth = getAuth({ db: context.db, env });

    await auth.api.signUpEmail({
      body: {
        name: "First",
        email: "first@example.com",
        password: "password1234",
      },
    });

    const [first] = await context.db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.email, "first@example.com"))
      .limit(1);
    expect(first?.role).toBe("admin");

    await auth.api.signUpEmail({
      body: {
        name: "Second",
        email: "second@example.com",
        password: "password1234",
      },
    });

    const [second] = await context.db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.email, "second@example.com"))
      .limit(1);
    expect(second?.role).not.toBe("admin");
  });
});

describe("passkey authentication", () => {
  it("offers a local challenge without Turnstile, but requires a session to register", async () => {
    const context = createTestContext();
    const auth = getAuth({ db: context.db, env });
    const request = (path: string, options?: RequestInit) =>
      auth.handler(
        new Request(`http://localhost:3000/api/auth/passkey/${path}`, {
          headers: {
            origin: "http://localhost:3000",
            "content-type": "application/json",
          },
          ...options,
        }),
      );
    const register = await request("generate-register-options");
    expect(register.status).toBe(401);
    const apiKeyRegister = await request("generate-register-options", {
      headers: {
        origin: "http://localhost:3000",
        "x-api-key": "fsb_cannot_enroll_passkeys",
      },
    });
    expect(apiKeyRegister.status).toBe(403);
    const options = await request("generate-authenticate-options");
    expect(options.status).toBe(200);
    const data = (await options.json()) as { challenge: string; rpId: string };
    expect(data.challenge.length).toBeGreaterThan(20);
    expect(data.rpId).toBe("localhost");
  });
});
