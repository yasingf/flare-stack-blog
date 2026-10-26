import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { z } from "zod";
import {
  AuthVerification,
  useAuthVerification,
} from "@/components/common/auth-verification";
import { LoginPage } from "@/features/auth/components/login-page";
import { useLoginForm, useSocialLogin } from "@/features/auth/hooks";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_public/_auth/login")({
  validateSearch: z.object({
    redirectTo: z.string().optional(),
  }),
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: m.login_title(),
      },
    ],
  }),
});

function RouteComponent() {
  const { isEmailConfigured } = useRouteContext({ from: "/_public/_auth" });
  const search = Route.useSearch();
  const {
    isPending: turnstilePending,
    token: turnstileToken,
    reset: resetTurnstile,
    turnstileProps,
  } = useAuthVerification("login");

  const resolvedRedirectTo = search.redirectTo;

  const loginForm = useLoginForm({
    turnstileToken,
    turnstilePending,
    resetTurnstile,
    redirectTo: resolvedRedirectTo,
  });

  const socialLogin = useSocialLogin({
    redirectTo: resolvedRedirectTo,
  });

  const turnstileElement = isEmailConfigured ? (
    <div className="flex justify-center">
      <AuthVerification {...turnstileProps} />
    </div>
  ) : null;

  return (
    <LoginPage
      isEmailConfigured={isEmailConfigured}
      loginForm={{
        ...loginForm,
        turnstilePending,
      }}
      socialLogin={socialLogin}
      turnstileElement={turnstileElement}
    />
  );
}
