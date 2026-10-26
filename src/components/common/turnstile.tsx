import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { clientEnv } from "@/lib/env/client.env";

const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: Record<string, unknown>,
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    __turnstileToken?: string | null;
  }
}

/**
 * Get the current global Turnstile token for TanStack Server Functions.
 * Used by the client-side middleware to inject X-Turnstile-Token header.
 */
export function getTurnstileToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.__turnstileToken || null;
}

/**
 * Set the global Turnstile token (called internally by useTurnstile).
 */
function setTurnstileToken(token: string | null): void {
  if (typeof window !== "undefined") {
    window.__turnstileToken = token;
  }
}

interface TurnstileProps {
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  action?: string;
  size?: "normal" | "compact";
  widgetIdRef?: RefObject<string | null>;
  retryKey?: number;
}

export type { TurnstileProps };

let scriptLoadPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    const timeout = window.setTimeout(() => fail(), 20000);
    const fail = () => {
      window.clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      script.remove();
      scriptLoadPromise = null;
      reject(new Error("Failed to load Turnstile script"));
    };
    script.onload = () => {
      window.clearTimeout(timeout);
      if (window.turnstile) resolve();
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export function Turnstile({
  onVerify,
  onError,
  onExpire,
  action,
  size = "normal",
  widgetIdRef: externalWidgetIdRef,
  retryKey = 0,
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const internalWidgetIdRef = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "verified" | "failed">(
    "loading",
  );

  const siteKey = clientEnv().VITE_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    let mounted = true;
    setStatus("loading");
    const failed = () => {
      if (!mounted) return;
      setStatus("failed");
      onError?.();
      onExpire?.();
    };
    const timeout = window.setTimeout(failed, 30000);

    loadScript()
      .then(() => {
        if (!mounted || !containerRef.current || !window.turnstile) return;

        const id = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => {
            if (!mounted) return;
            window.clearTimeout(timeout);
            setStatus("verified");
            onVerify(token);
          },
          "error-callback": failed,
          "expired-callback": failed,
          "timeout-callback": failed,
          action,
          size,
          appearance: "interaction-only",
        });
        internalWidgetIdRef.current = id;
        if (externalWidgetIdRef) {
          externalWidgetIdRef.current = id;
        }
      })
      .catch(failed);

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      if (internalWidgetIdRef.current && window.turnstile) {
        window.turnstile.remove(internalWidgetIdRef.current);
        internalWidgetIdRef.current = null;
        if (externalWidgetIdRef) {
          externalWidgetIdRef.current = null;
        }
      }
    };
  }, [
    siteKey,
    onVerify,
    onError,
    onExpire,
    action,
    size,
    externalWidgetIdRef,
    attempt,
    retryKey,
  ]);

  if (!siteKey) return null;

  return (
    <div className="w-full space-y-2 text-sm">
      <div ref={containerRef} />
      {status === "loading" && (
        <p role="status" className="text-muted-foreground">
          正在加载安全验证…
        </p>
      )}
      {status === "failed" && (
        <div role="alert" className="text-muted-foreground">
          <p>
            安全验证未完成或加载超时，请重试。已绑定通行密钥的账号可以使用通行密钥登录。
          </p>
          <button
            type="button"
            className="underline underline-offset-4 mt-2"
            onClick={() => {
              onExpire?.();
              setAttempt((n) => n + 1);
            }}
          >
            重新加载验证器
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Hook for using Turnstile in forms (client-side only).
 * Returns { isPending, token, turnstileProps } — spread turnstileProps onto <Turnstile />.
 * Use `isPending` to disable submit buttons until verification completes.
 * Use `token` in API request headers as `X-Turnstile-Token`.
 */
export function useTurnstile(action?: string) {
  const [token, setToken] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = clientEnv().VITE_TURNSTILE_SITE_KEY;

  const onVerify = useCallback((t: string) => {
    setToken(t);
    setTurnstileToken(t); // Sync to global store for TanStack middleware
  }, []);

  const onExpire = useCallback(() => {
    setToken(null);
    setTurnstileToken(null);
  }, []);

  /** Reset the Turnstile widget to obtain a fresh token (tokens are single-use). */
  const reset = useCallback(() => {
    setToken(null);
    setTurnstileToken(null);
    if (widgetIdRef.current && window.turnstile)
      window.turnstile.reset(widgetIdRef.current);
    setRetryKey((n) => n + 1);
  }, []);

  return {
    /** Turnstile is configured but challenge not yet completed */
    isPending: !!siteKey && !token,
    /** The Turnstile token to send in X-Turnstile-Token header */
    token,
    /** Reset the widget to get a fresh token after each API call */
    reset,
    turnstileProps: {
      onVerify,
      onExpire,
      action,
      widgetIdRef,
      retryKey,
    } satisfies TurnstileProps,
  };
}
