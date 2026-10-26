import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { clientEnv } from "@/lib/env/client.env";

type Counter = {
  count?: (data: { path: string; title: string; referrer: string }) => void;
};
let loading: Promise<void> | undefined;
function loadCounter(site: string) {
  return (loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://gc.zgo.at/count.js";
    script.async = true;
    script.dataset.goatcounter = `${site.replace(/\/$/, "")}/count`;
    script.dataset.goatcounterSettings = JSON.stringify({ no_onload: true });
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      loading = undefined;
      reject(new Error("Analytics unavailable"));
    };
    document.head.appendChild(script);
  }));
}
function referrerPath() {
  try {
    const url = new URL(document.referrer);
    return url.origin + url.pathname;
  } catch {
    return "";
  }
}
/** Track public SPA navigations once; query strings and account pages stay out. */
export function GoatCounterTracker() {
  const path = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname,
  });
  useEffect(() => {
    const site = clientEnv().VITE_GOATCOUNTER_SITE;
    if (
      !site ||
      /^\/(login|register|forgot-password|reset-password|verify-email|account|profile)(\/|$)/.test(
        path,
      )
    )
      return;
    let cancelled = false;
    let frame = 0;
    void loadCounter(site)
      .then(() => {
        if (!cancelled)
          frame = requestAnimationFrame(() => {
            (window as Window & { goatcounter?: Counter }).goatcounter?.count?.(
              {
                path,
                title: document.title,
                referrer: referrerPath(),
              },
            );
          });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [path]);
  return null;
}
