// @vitest-environment jsdom
import { createElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Turnstile } from "./turnstile";
vi.mock("@/lib/env/client.env", () => ({
  clientEnv: () => ({ VITE_TURNSTILE_SITE_KEY: "test" }),
}));
afterEach(() => {
  cleanup();
  delete window.turnstile;
  vi.useRealTimers();
});
describe("Turnstile recovery", () => {
  it("shows stalled script loading and can retry with a fresh script", async () => {
    vi.useFakeTimers();
    const expire = vi.fn();
    render(createElement(Turnstile, { onVerify: vi.fn(), onExpire: expire }));
    expect(screen.getByRole("status").textContent).toContain("正在加载");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(screen.getByRole("alert").textContent).toContain("加载超时");
    expect(expire).toHaveBeenCalled();
    expect(
      document.querySelector('script[src*="challenges.cloudflare.com"]'),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重新加载验证器" }));
    expect(screen.getByRole("status").textContent).toContain("正在加载");
    const script = document.querySelector(
      'script[src*="challenges.cloudflare.com"]',
    )!;
    expect(script).not.toBeNull();
    await act(async () => {
      fireEvent.error(script);
    });
    expect(screen.getByRole("alert")).not.toBeNull();
  });
  it("invalidates an expired token and renders a new widget after retry", async () => {
    vi.useFakeTimers();
    let callbacks: Record<string, unknown> = {};
    const verify = vi.fn(),
      expire = vi.fn(),
      remove = vi.fn();
    window.turnstile = {
      render: vi.fn((_el, options) => {
        callbacks = options;
        return "widget";
      }),
      reset: vi.fn(),
      remove,
    };
    await act(async () => {
      render(createElement(Turnstile, { onVerify: verify, onExpire: expire }));
    });
    act(() => (callbacks.callback as (s: string) => void)("valid-token"));
    expect(verify).toHaveBeenCalledWith("valid-token");
    expect(screen.queryByRole("status")).toBeNull();
    act(() => (callbacks["expired-callback"] as () => void)());
    expect(expire).toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "重新加载验证器" }));
    });
    expect(remove).toHaveBeenCalledWith("widget");
    expect(window.turnstile.render).toHaveBeenCalledTimes(2);
  });
});
