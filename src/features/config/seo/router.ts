import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { adminProcedure, publicProcedure } from "@/lib/orpc/procedure";
import { invalidate } from "@/features/cache/public-cache";
import { SystemConfigSchema } from "../config.schema";
import * as ConfigRepo from "../data/config.data";
import { getSystemConfig } from "../service/config.service";
import { getSiteUrls, submitUrlsToSearchEngines } from "./service";

const get = adminProcedure
  .route({ method: "GET", path: "/admin/seo" })
  .handler(async ({ context }) => {
    const snapshot = await ConfigRepo.getConfigSnapshot(context.db);
    return {
      seo: snapshot.config.seo ?? {},
      siteRevision: snapshot.siteRevision,
      notificationRevision: snapshot.notificationRevision,
    };
  });

const save = adminProcedure
  .route({ method: "PUT", path: "/admin/seo" })
  .input(
    z.object({
      seo: SystemConfigSchema.shape.seo,
      siteRevision: z.number().int().nonnegative(),
      notificationRevision: z.number().int().nonnegative(),
    }),
  )
  .handler(async ({ context, input }) => {
    const current = await ConfigRepo.getConfigSnapshot(context.db);
    if (
      current.siteRevision !== input.siteRevision ||
      current.notificationRevision !== input.notificationRevision
    )
      throw new ORPCError("CONFLICT", { message: "设置已更新，请刷新后重试" });
    const saved = await ConfigRepo.compareAndSetConfig(
      context.db,
      current,
      { ...current.config, seo: input.seo },
      "site",
    );
    if (!saved) throw new ORPCError("CONFLICT");
    await invalidate.siteConfigChanged(context);
    return { success: true };
  });

const urls = adminProcedure
  .route({ method: "GET", path: "/admin/seo/urls" })
  .handler(({ context }) => getSiteUrls(context));

const submit = adminProcedure
  .route({ method: "POST", path: "/admin/seo/submit" })
  .input(z.object({ urls: z.array(z.url()).min(1).max(1000) }))
  .handler(({ context, input }) =>
    submitUrlsToSearchEngines(context, input.urls),
  );

const verification = publicProcedure
  .route({ method: "GET", path: "/seo/verification" })
  .handler(async ({ context }) => {
    const seo = (await getSystemConfig(context))?.seo;
    return {
      google: seo?.googleVerification,
      bing: seo?.bingVerification,
      baidu: seo?.baiduVerification,
    };
  });

export default { get, save, urls, submit, verification };
