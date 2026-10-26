import { Link } from "@tanstack/react-router";
import { Check, CircleAlert, Fingerprint } from "lucide-react";
import { useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth/auth-client";
import { normalizeRedirectUrl } from "../hooks/normalize-redirect-url";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { GithubIcon } from "@/components/common/brand-icon";
import type { useLoginForm } from "../hooks/use-login-form";
import type { useSocialLogin } from "../hooks/use-social-login";
import { Callout } from "@/components/ui/callout";
import { StatusText } from "@/components/ui/status-text";
import { m } from "@/paraglide/messages";

interface LoginPageProps {
  isEmailConfigured: boolean;
  loginForm: ReturnType<typeof useLoginForm> & { turnstilePending: boolean };
  socialLogin: ReturnType<typeof useSocialLogin>;
  turnstileElement: ReactNode;
}

export function LoginPage({
  isEmailConfigured,
  loginForm,
  socialLogin,
  turnstileElement,
}: LoginPageProps) {
  const {
    register,
    errors,
    handleSubmit,
    loginStep,
    isSubmitting,
    turnstilePending,
    loginError,
    resendFeedback,
    isResending,
    resendVerification,
  } = loginForm;
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState("");
  async function signInPasskey() {
    setPasskeyBusy(true);
    setPasskeyError("");
    try {
      if (!window.PublicKeyCredential)
        throw new Error(
          "当前浏览器不支持通行密钥，请更新浏览器或使用其他登录方式。",
        );
      const result = await authClient.signIn.passkey();
      if (result.error)
        throw new Error(
          "通行密钥登录未完成。请使用已绑定的设备重试；首次使用请先登录，在个人资料中添加通行密钥。",
        );
      window.location.assign(
        normalizeRedirectUrl(
          new URLSearchParams(location.search).get("redirectTo") ?? undefined,
          "/profile",
        ),
      );
    } catch (e) {
      setPasskeyError(e instanceof Error ? e.message : "登录未完成，请重试。");
    } finally {
      setPasskeyBusy(false);
    }
  }
  const busy =
    passkeyBusy ||
    isSubmitting ||
    loginStep !== "IDLE" ||
    socialLogin.isLoading ||
    isResending;
  return (
    <div className="auth-page">
      <header className="auth-heading">
        <h1>{m.login_title()}</h1>
        <p>{m.login_welcome_back()}</p>
      </header>
      <Button
        variant="regular"
        size="lg"
        onClick={() => void signInPasskey()}
        disabled={busy}
        loading={passkeyBusy}
        icon={<Fingerprint size={18} />}
        className="auth-action"
      >
        使用通行密钥登录
      </Button>
      <p className="auth-note">
        已绑定的设备可通过指纹、面容、系统 PIN
        或安全密钥登录，无需验证码。首次绑定请前往个人资料。
      </p>
      {passkeyError && <StatusText error>{passkeyError}</StatusText>}
      <Button
        variant={isEmailConfigured ? "regular" : "primary"}
        size="lg"
        onClick={socialLogin.handleGithubLogin}
        disabled={busy}
        loading={socialLogin.isLoading}
        icon={<GithubIcon size={18} />}
        className="auth-action"
      >
        {socialLogin.isLoading
          ? m.login_social_connecting()
          : m.login_github_continue()}
      </Button>
      {socialLogin.errorMessage && (
        <StatusText error>{socialLogin.errorMessage}</StatusText>
      )}
      {isEmailConfigured && (
        <>
          <div className="auth-divider">
            <span>{m.login_email_alternative()}</span>
          </div>
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <FormField
              label={m.login_email_address()}
              error={errors.email?.message}
              required
            >
              <Input
                {...register("email")}
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={m.login_email_placeholder()}
                disabled={busy}
              />
            </FormField>
            <FormField
              label={m.login_password()}
              error={errors.password?.message}
              required
              action={
                <Link to="/forgot-password" className="auth-field-link">
                  {m.login_forgot_password_fuwari()}
                </Link>
              }
            >
              <PasswordInput
                {...register("password")}
                autoComplete="current-password"
                placeholder={m.login_password_placeholder()}
                disabled={busy}
              />
            </FormField>
            {loginError && (
              <Callout
                tone="danger"
                icon={CircleAlert}
                role="alert"
                action={
                  loginError.unverified && (
                    <Button
                      variant="text"
                      size="sm"
                      onClick={resendVerification}
                      disabled={busy || turnstilePending}
                      loading={isResending}
                    >
                      {m.login_resend_verification()}
                    </Button>
                  )
                }
              >
                {loginError.message}
              </Callout>
            )}
            {resendFeedback && (
              <p className="auth-note" role="status">
                {resendFeedback}
              </p>
            )}
            <div className="auth-verification">{turnstileElement}</div>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="auth-action"
              disabled={busy}
              loading={loginStep === "VERIFYING"}
              icon={loginStep === "SUCCESS" ? <Check size={16} /> : null}
            >
              {loginStep === "VERIFYING"
                ? m.login_submitting()
                : loginStep === "SUCCESS"
                  ? m.login_toast_success()
                  : m.login_email_submit()}
            </Button>
          </form>
          <footer className="auth-register">
            {m.login_no_account()}{" "}
            <Link to="/register">{m.login_email_register()}</Link>
          </footer>
        </>
      )}
    </div>
  );
}
