import { describe, it, expect, vi } from "vitest";
import {
  createGoatCounterClient,
  resolveGoatCounterConfig,
} from "./data/goatcounter-api";
const config = resolveGoatCounterConfig({
  GOATCOUNTER_SITE: "https://example.goatcounter.com",
  GOATCOUNTER_API_TOKEN: "private-token",
});
const window = {
  startAt: Date.parse("2026-10-01T00:00Z"),
  endAt: Date.parse("2026-10-26T00:00Z"),
};
describe("GoatCounter statistics", () => {
  it("paginates by excluded path IDs, ignores events, and keeps the key in headers", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          hits: [
            { path_id: 1, path: "/post/a", count: 12, event: false },
            { path_id: 2, path: "play", count: 9, event: true },
          ],
          more: true,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          hits: [{ path_id: 3, path: "/post/b", count: 4 }],
          more: false,
        }),
      );
    const wait = vi.fn(async () => {});
    expect(
      await createGoatCounterClient({ fetcher, wait }).getPathMetrics(
        config,
        window,
      ),
    ).toEqual([
      { path: "/post/a", pageviews: 12 },
      { path: "/post/b", pageviews: 4 },
    ]);
    const url = new URL(fetcher.mock.calls[1][0] as URL);
    expect(url.searchParams.get("exclude_paths")).toBe("1,2");
    expect(url.searchParams.get("start")).toBe("2026-10-01T00:00:00.000Z");
    expect(url.href).not.toContain("private-token");
    expect(fetcher.mock.calls[0][1]?.headers).toHaveProperty(
      "Authorization",
      "Bearer private-token",
    );
    expect(wait).toHaveBeenCalledWith(300);
  });
  it("rejects repeated pages and redacts upstream error bodies", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("private-token", { status: 403 }));
    await expect(
      createGoatCounterClient({ fetcher }).getPathMetrics(config, window),
    ).rejects.toThrow("GoatCounter statistics request failed (403)");
    fetcher.mockImplementation(async () =>
      Response.json({
        hits: [{ path_id: 1, path: "/post/a", count: 1 }],
        more: true,
      }),
    );
    await expect(
      createGoatCounterClient({ fetcher, wait: async () => {} }).getPathMetrics(
        config,
        window,
      ),
    ).rejects.toThrow("repeated");
  });
  it("rejects insecure credentials or incomplete configuration", () => {
    for (const site of [
      "http://example.com",
      "https://user:pass@example.com",
      "https://example.com/?key=secret",
    ]) {
      expect(() =>
        resolveGoatCounterConfig({
          GOATCOUNTER_SITE: site,
          GOATCOUNTER_API_TOKEN: "key",
        }),
      ).toThrow();
    }
    expect(() =>
      resolveGoatCounterConfig({ GOATCOUNTER_SITE: "https://example.com" }),
    ).toThrow();
  });
});
