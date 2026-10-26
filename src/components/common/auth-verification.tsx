import { useCallback, useEffect, useRef, useState } from "react";
import { Turnstile } from "./turnstile";

type Provider = "altcha" | "turnstile" | "none";
export function useAuthVerification(action: string) {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setError(false);
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    void fetch("/api/auth/verification", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("verification unavailable");
        const data = (await response.json()) as { provider: Provider };
        if (!["altcha", "turnstile", "none"].includes(data.provider))
          throw new Error("unknown provider");
        if (active) setProvider(data.provider);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [attempt]);
  const onVerify = useCallback((value: string) => setToken(value), []);
  const onExpire = useCallback(() => setToken(null), []);
  const reset = useCallback(() => {
    setToken(null);
    setRetryKey((n) => n + 1);
  }, []);
  return {
    token,
    isPending: provider !== "none" && !token,
    reset,
    turnstileProps: {
      provider,
      token,
      onVerify,
      onExpire,
      action,
      retryKey,
      error,
      retry: () => setAttempt((n) => n + 1),
    },
  };
}
export function AuthVerification(
  props: ReturnType<typeof useAuthVerification>["turnstileProps"],
) {
  if (props.provider === "none") return null;
  if (!props.provider)
    return (
      <div
        role={props.error ? "alert" : "status"}
        className="text-sm text-muted-foreground"
      >
        {props.error ? (
          <>
            验证服务加载失败。
            <button
              type="button"
              className="underline ml-2"
              onClick={props.retry}
            >
              重试
            </button>
          </>
        ) : (
          "正在选择验证方式…"
        )}
      </div>
    );
  return props.provider === "turnstile" ? (
    <Turnstile {...props} />
  ) : (
    <LocalVerification
      key={props.retryKey}
      onVerify={props.onVerify}
      onExpire={props.onExpire}
    />
  );
}
function LocalVerification({
  onVerify,
  onExpire,
}: {
  onVerify: (token: string) => void;
  onExpire: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let widget: HTMLElement | undefined;
    let expiration: ReturnType<typeof setTimeout> | undefined;
    setFailed(false);
    const fail = () => {
      if (active) {
        setFailed(true);
        onExpire();
      }
    };
    const timeout = window.setTimeout(fail, 45000);
    const verified = (event: Event) => {
      const payload = (event as CustomEvent<{ payload?: string }>).detail
        .payload;
      if (!active || !payload) return;
      window.clearTimeout(timeout);
      setFailed(false);
      onVerify(`altcha:${payload}`);
      expiration = setTimeout(fail, 240000);
    };
    void import("altcha")
      .then(async () => {
        await import("altcha/i18n/zh-cn");
        if (!active || !host.current) return;
        widget = document.createElement("altcha-widget");
        widget.setAttribute("challenge", "/api/auth/challenge");
        widget.setAttribute("auto", "onload");
        widget.setAttribute("language", "zh-cn");
        widget.addEventListener("verified", verified);
        widget.addEventListener("statechange", (event) => {
          if (
            (event as CustomEvent<{ state: string }>).detail.state === "error"
          )
            fail();
        });
        host.current.replaceChildren(widget);
      })
      .catch(fail);
    return () => {
      active = false;
      clearTimeout(timeout);
      clearTimeout(expiration);
      widget?.removeEventListener("verified", verified);
      widget?.remove();
    };
  }, [attempt, onVerify, onExpire]);
  return (
    <div className="space-y-2 w-full">
      <p className="text-xs text-muted-foreground">当前网络使用本站安全验证</p>
      <div ref={host} />
      {failed && (
        <p role="alert" className="text-sm">
          验证未完成或已过期。
          <button
            type="button"
            className="underline ml-2"
            onClick={() => {
              onExpire();
              setAttempt((n) => n + 1);
            }}
          >
            重新验证
          </button>
        </p>
      )}
    </div>
  );
}
