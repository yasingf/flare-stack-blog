import { apiKey } from "@better-auth/api-key";
import { passkey } from "@better-auth/passkey";
import { APIError } from "better-auth/api";
import type { BetterAuthOptions } from "better-auth";
import { admin } from "better-auth/plugins";

export function createAuthConfig(baseURL?: string) {
  return {
    emailAndPassword: {
      enabled: true,
    },
    session: {
      storeSessionInDatabase: true,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    user: {
      additionalFields: {
        mutedAt: {
          type: "date",
          required: false,
          input: false,
        },
      },
    },
    plugins: [
      admin(),
      passkey({
        rpName: "Yasin's Blog",
        ...(baseURL
          ? { rpID: new URL(baseURL).hostname, origin: new URL(baseURL).origin }
          : {}),
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
        registration: {
          afterVerification: ({ verification }) => {
            if (!verification.registrationInfo?.userVerified)
              throw new APIError("FORBIDDEN", {
                message: "请通过设备指纹、面容或 PIN 完成身份验证。",
              });
          },
        },
        authentication: {
          afterVerification: ({ verification }) => {
            if (!verification.authenticationInfo.userVerified)
              throw new APIError("FORBIDDEN", {
                message: "请通过设备指纹、面容或 PIN 完成身份验证。",
              });
          },
        },
      }),
      apiKey({
        enableSessionForAPIKeys: true,
        requireName: true,
        defaultPrefix: "fsb_",
        rateLimit: { enabled: false },
        keyExpiration: {
          defaultExpiresIn: null,
          disableCustomExpiresTime: true,
        },
      }),
    ],
  } satisfies BetterAuthOptions;
}
