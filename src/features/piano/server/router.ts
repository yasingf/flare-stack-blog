import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { coachFactsSchema } from "../coach.schema";
import { authProcedure, withRateLimit } from "@/lib/orpc/procedure";
import shared from "./shared";
import articles from "./articles";

async function coach() {
  const { exports } = await import("cloudflare:workers");
  return exports.PianoCoach.getByName("piano-coach-v1");
}

const status = authProcedure
  .route({ method: "GET", path: "/me/piano/ai" })
  .handler(async ({ context }) =>
    (await coach()).status(context.session.user.id),
  );
const savedAdvice = authProcedure
  .route({ method: "GET", path: "/me/piano/ai/saved" })
  .input(coachFactsSchema)
  .handler(async ({ context, input }) =>
    (await coach()).saved(context.session.user.id, input),
  );
const advice = authProcedure
  .use(withRateLimit({ capacity: 3, interval: "1m", key: "piano:ai" }))
  .route({ method: "POST", path: "/me/piano/ai" })
  .input(coachFactsSchema)
  .handler(async ({ context, input }) => {
    if (!context.session.user.emailVerified)
      throw new ORPCError("FORBIDDEN", {
        message: "请先验证注册邮箱，再使用 AI 建议。",
      });
    const result = await (
      await coach()
    ).generate(context.session.user.id, input);
    if ("error" in result)
      throw new ORPCError("BAD_REQUEST", { message: result.error });
    return result;
  });

const list = authProcedure
  .route({ method: "GET", path: "/me/piano/scores" })
  .handler(async ({ context }) => {
    const result = await context.env.DB.prepare(
      "SELECT id, title, file_name AS fileName, size, created_at AS createdAt FROM piano_scores WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
    )
      .bind(context.session.user.id)
      .all<{
        id: string;
        title: string;
        fileName: string;
        size: number;
        createdAt: number;
      }>();
    return result.results;
  });
// Cached versions of the former private library must not silently publish files.
const save = authProcedure
  .route({ method: "POST", path: "/me/piano/scores" })
  .input(z.object({ file: z.file().max(4 * 1024 * 1024), title: z.string() }))
  .handler(() => {
    throw new ORPCError("CONFLICT", {
      message:
        "曲库已统一为全站共享。请刷新页面，同意共享协议后使用“上传并共享”。",
    });
  });
const load = shared.load.route({
  method: "GET",
  path: "/me/piano/scores/{id}",
});
const remove = shared.remove.route({
  method: "DELETE",
  path: "/me/piano/scores/{id}",
});
export default {
  status,
  savedAdvice,
  advice,
  list,
  save,
  load,
  remove,
  shared,
  articles,
};
