import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { coachFactsSchema } from "../coach.schema";
import { authProcedure, withRateLimit } from "@/lib/orpc/procedure";

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
const save = authProcedure
  .use(withRateLimit({ capacity: 10, interval: "1h", key: "piano:upload" }))
  .route({ method: "POST", path: "/me/piano/scores" })
  .input(
    z.object({
      file: z
        .file()
        .max(4 * 1024 * 1024)
        .refine(
          (file) => /\.(mid|midi|xml|musicxml|mxl)$/i.test(file.name),
          "只支持 MIDI / MusicXML。",
        ),
      title: z.string().min(1).max(160),
    }),
  )
  .handler(async ({ context, input }) => {
    const bytes = await input.file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = [...new Uint8Array(digest)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    const existing = await context.env.DB.prepare(
      "SELECT id FROM piano_scores WHERE user_id = ? AND hash = ?",
    )
      .bind(context.session.user.id, hash)
      .first<{ id: string }>();
    if (existing) return { id: existing.id };
    const id = crypto.randomUUID();
    const key = `piano-private/${id}`;
    await context.env.R2.put(key, bytes, {
      httpMetadata: { contentType: "application/octet-stream" },
    });
    try {
      const insert = await context.env.DB.prepare(
        "INSERT OR IGNORE INTO piano_scores (id, user_id, hash, title, file_name, size, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM piano_scores WHERE user_id = ?) < 50",
      )
        .bind(
          id,
          context.session.user.id,
          hash,
          input.title,
          input.file.name.slice(0, 200),
          input.file.size,
          Date.now(),
          context.session.user.id,
        )
        .run();
      if (!insert.meta.changes)
        throw new ORPCError("BAD_REQUEST", {
          message: "账号最多保存 50 首曲谱，或这首谱子已经保存。",
        });
    } catch (error) {
      await context.env.R2.delete(key);
      throw error;
    }
    return { id };
  });
const load = authProcedure
  .route({ method: "GET", path: "/me/piano/scores/{id}" })
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const row = await context.env.DB.prepare(
      "SELECT file_name AS fileName FROM piano_scores WHERE id = ? AND user_id = ?",
    )
      .bind(input.id, context.session.user.id)
      .first<{ fileName: string }>();
    if (!row) throw new ORPCError("NOT_FOUND");
    const object = await context.env.R2.get(`piano-private/${input.id}`);
    if (!object) throw new ORPCError("NOT_FOUND");
    // Binary API bodies otherwise get interpreted as JSON by the OpenAPI link.
    const data = new Uint8Array(await object.arrayBuffer());
    let binary = "";
    for (let i = 0; i < data.length; i += 8192)
      binary += String.fromCharCode(...data.subarray(i, i + 8192));
    return { fileName: row.fileName, base64: btoa(binary) };
  });
const remove = authProcedure
  .route({ method: "DELETE", path: "/me/piano/scores/{id}" })
  .input(z.object({ id: z.uuid() }))
  .handler(async ({ context, input }) => {
    const row = await context.env.DB.prepare(
      "DELETE FROM piano_scores WHERE id = ? AND user_id = ? RETURNING id",
    )
      .bind(input.id, context.session.user.id)
      .first();
    if (!row) throw new ORPCError("NOT_FOUND");
    await context.env.R2.delete(`piano-private/${input.id}`);
    return { success: true };
  });
export default { status, savedAdvice, advice, list, save, load, remove };
