import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  AuthVerification,
  useAuthVerification,
} from "@/components/common/auth-verification";
import { ForgotPasswordPage } from "@/features/auth/components/forgot-password-page";
import { useForgotPasswordForm } from "@/features/auth/hooks";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_public/_auth/forgot-password")({
  beforeLoad: ({ context }) => {
    if (!context.isEmailConfigured) {
      throw redirect({ to: "/login" });
    }
  },
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: m.forgot_password_title(),
      },
    ],
  }),
});

function RouteComponent() {
  const {
    isPending: turnstilePending,
    token: turnstileToken,
    reset: resetTurnstile,
    turnstileProps,
  } = useAuthVerification("forgot-password");

  const forgotPasswordForm = useForgotPasswordForm({
    turnstileToken,
    turnstilePending,
    resetTurnstile,
  });

  const turnstileElement = (
    <div className="flex justify-center">
      <AuthVerification {...turnstileProps} />
    </div>
  );

  return (
    <ForgotPasswordPage
      forgotPasswordForm={{
        ...forgotPasswordForm,
        turnstilePending,
      }}
      turnstileElement={turnstileElement}
    />
  );
}
