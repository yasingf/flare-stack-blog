import { z } from "zod";
import type { ServerEnv } from "@/lib/env/server.env";
import type {
  PostPopularityMetric,
  PostPopularityWindow,
} from "../post-popularity";

export type GoatCounterConfig = {
  type: "goatcounter";
  apiUrl: string;
  apiKey: string;
};
export function resolveGoatCounterConfig(
  env: Pick<ServerEnv, "GOATCOUNTER_SITE" | "GOATCOUNTER_API_TOKEN">,
): GoatCounterConfig {
  if (!env.GOATCOUNTER_SITE?.trim() || !env.GOATCOUNTER_API_TOKEN?.trim())
    throw new Error(
      "GoatCounter needs GOATCOUNTER_SITE and GOATCOUNTER_API_TOKEN",
    );
  const url = new URL(env.GOATCOUNTER_SITE);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("GOATCOUNTER_SITE must be an HTTPS origin");
  return {
    type: "goatcounter",
    apiUrl: `${url.origin}/api/v0`,
    apiKey: env.GOATCOUNTER_API_TOKEN.trim(),
  };
}
const PageSchema = z.object({
  hits: z.array(
    z.object({
      path_id: z.number().int().positive(),
      path: z.string(),
      count: z.number().int().nonnegative(),
      event: z.boolean().optional(),
    }),
  ),
  more: z.boolean(),
});
export function createGoatCounterClient({
  fetcher = fetch,
  wait = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
}: {
  fetcher?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
} = {}) {
  return {
    async getPathMetrics(
      config: GoatCounterConfig,
      window: PostPopularityWindow,
    ): Promise<PostPopularityMetric[]> {
      const seen = new Set<number>(),
        metrics: PostPopularityMetric[] = [];
      // GoatCounter paginates by excluding already returned path IDs. Bound both
      // request count and repeated pages; never overwrite a snapshot with a partial result.
      for (let page = 0; page < 100; page++) {
        if (page) await wait(300); // API allows four requests per second.
        const url = new URL(`${config.apiUrl}/stats/hits`);
        url.searchParams.set(
          "start",
          new Date(
            Math.floor(window.startAt / 3600000) * 3600000,
          ).toISOString(),
        );
        url.searchParams.set(
          "end",
          new Date(Math.floor(window.endAt / 3600000) * 3600000).toISOString(),
        );
        url.searchParams.set("limit", "100");
        if (seen.size)
          url.searchParams.set("exclude_paths", [...seen].join(","));
        const response = await fetcher(url, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          signal: AbortSignal.timeout(10000),
          redirect: "error",
        });
        // Upstream error bodies may contain request details; never persist them.
        if (!response.ok)
          throw new Error(
            `GoatCounter statistics request failed (${response.status})`,
          );
        const result = PageSchema.parse(await response.json());
        let added = 0;
        for (const hit of result.hits) {
          if (seen.has(hit.path_id)) continue;
          seen.add(hit.path_id);
          added++;
          // GoatCounter's count is visits, not Umami's raw pageview metric.
          if (!hit.event)
            metrics.push({ path: hit.path, pageviews: hit.count });
        }
        if (!result.more) return metrics;
        if (!added)
          throw new Error("GoatCounter returned a repeated statistics page");
      }
      throw new Error("GoatCounter statistics pagination limit reached");
    },
  };
}
export const goatCounterClient = createGoatCounterClient();
