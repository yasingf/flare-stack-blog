import { z } from "zod";
import * as GuitarTabs from "../service";
import { getUserList } from "@/features/auth/data/users.data";
import {
  adminProcedure,
  authProcedure,
  publicProcedure,
  withRateLimit,
} from "@/lib/orpc/procedure";

const page = z.number().int().min(1).default(1);
const pageSize = z.number().int().min(1).max(100).default(20);
const mediaId = z.number().int().positive();

const list = publicProcedure
  .route({ method: "GET", path: "/guitar-tabs" })
  .input(z.object({ page, pageSize, search: z.string().max(200).optional() }))
  .handler(({ context, input }) =>
    GuitarTabs.getGuitarTabsList(context, input),
  );

const count = publicProcedure
  .route({ method: "GET", path: "/guitar-tabs/count" })
  .handler(({ context }) => GuitarTabs.getApprovedGuitarTabsCount(context));

const detail = publicProcedure
  .route({ method: "GET", path: "/guitar-tabs/{slug}" })
  .input(z.object({ slug: z.string().min(1).max(200) }))
  .handler(({ context, input }) =>
    GuitarTabs.getGuitarTabBySlug(context, input.slug),
  );

const mine = authProcedure
  .route({ method: "GET", path: "/me/guitar-tabs" })
  .handler(({ context }) => GuitarTabs.getMyGuitarTabs(context));

const submit = authProcedure
  .use(
    withRateLimit({ capacity: 5, interval: "1h", key: "guitar-tabs:submit" }),
  )
  .route({ method: "POST", path: "/me/guitar-tabs" })
  .input(z.object({ file: z.file().max(50 * 1024 * 1024) }))
  .handler(({ context, input }) => GuitarTabs.submitGuitarTab(context, input));

const adminList = adminProcedure
  .route({ method: "GET", path: "/admin/guitar-tabs" })
  .input(
    z.object({
      cursor: mediaId.optional(),
      limit: pageSize,
      search: z.string().max(200).optional(),
      status: z.enum(["pending", "approved", "rejected"]).optional(),
    }),
  )
  .handler(({ context, input }) =>
    GuitarTabs.getGuitarTabsListAdmin(context, input),
  );

const meta = adminProcedure
  .route({ method: "GET", path: "/admin/guitar-tabs/{mediaId}" })
  .input(z.object({ mediaId }))
  .handler(({ context, input }) =>
    GuitarTabs.getGuitarTabMetaByMediaId(context, input.mediaId),
  );

const review = adminProcedure
  .route({ method: "PATCH", path: "/admin/guitar-tabs/{mediaId}" })
  .input(
    z.object({
      mediaId,
      status: z.enum(["approved", "rejected"]),
      rejectionReason: z.string().max(2000).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    await GuitarTabs.reviewGuitarTab(context, input);
    return { success: true };
  });

const process = adminProcedure
  .route({ method: "POST", path: "/admin/guitar-tabs/process" })
  .handler(({ context }) =>
    GuitarTabs.processAllGuitarTabsDirect(context.env, context.db, true),
  );

const covers = adminProcedure
  .route({ method: "POST", path: "/admin/guitar-tabs/covers" })
  .handler(({ context }) =>
    GuitarTabs.fetchMissingCovers(context.env, context.db),
  );

export const adminUsers = adminProcedure
  .route({ method: "GET", path: "/admin/users" })
  .input(
    z.object({ page, limit: pageSize, search: z.string().max(200).optional() }),
  )
  .handler(({ context, input }) => getUserList(context.db, input));

export default {
  list,
  count,
  detail,
  mine,
  submit,
  admin: { list: adminList, meta, review, process, covers },
};
