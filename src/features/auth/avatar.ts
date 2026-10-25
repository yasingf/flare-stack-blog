import { z } from "zod";
import { authProcedure, withRateLimit } from "@/lib/orpc/procedure";
import * as Storage from "@/features/media/data/media.storage";
import * as MediaRepo from "@/features/media/data/media.data";
import { generateKey } from "@/features/media/utils/media.utils";
import { serverEnv } from "@/lib/env/server.env";

export const uploadAvatar = authProcedure
  .use(withRateLimit({ capacity: 10, interval: "1h", key: "avatar:upload" }))
  .route({ method: "POST", path: "/me/avatar" })
  .input(
    z.object({
      file: z
        .file()
        .max(3 * 1024 * 1024)
        .mime(["image/jpeg", "image/png", "image/webp"]),
    }),
  )
  .handler(async ({ context, input }) => {
    const key = `avatars/${context.session.user.id}/${generateKey(input.file.name)}`;
    const uploaded = await Storage.putToR2(context.env, input.file, key);
    try {
      await MediaRepo.insertMedia(context.db, uploaded);
      const url = `https://${serverEnv(context.env).DOMAIN}/images/${key}`;
      await context.auth.api.updateUser({
        headers: context.headers,
        body: { image: url },
      });
      return { url };
    } catch (error) {
      await MediaRepo.deleteMedia(context.db, key);
      await Storage.deleteFromR2(context.env, key);
      throw error;
    }
  });
