import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthTestContext, seedUser } from "tests/test-utils";
import {
  GuitarTabMetadataTable as Tabs,
  GuitarTabCommentsTable as Comments,
  MediaTable,
  user,
} from "@/lib/db/schema";
import * as Media from "@/features/media/service/media.service";
import * as MediaRepo from "@/features/media/data/media.data";
import * as GuitarTabs from "./service";
import router from "./server/router";
import comments from "./comments";

async function setup() {
  const base = createAuthTestContext();
  await seedUser(base.db, base.session.user);
  vi.mocked(base.auth.api.getSession).mockResolvedValue(base.session);
  const context = { ...base, headers: new Headers() };
  const insert = async (status: "approved" | "pending", slug: string) => {
    const [media] = await base.db
      .insert(MediaTable)
      .values({
        key: `${slug}.gp5`,
        url: `/images/${slug}.gp5`,
        fileName: `${slug}.gp5`,
        mimeType: "application/x-guitar-pro",
        sizeInBytes: 100,
      })
      .returning();
    const [tab] = await base.db
      .insert(Tabs)
      .values({
        mediaId: media.id,
        title: slug,
        slug,
        legacySlug: `old-${slug}`,
        status,
        uploaderId: base.session.user.id,
      })
      .returning();
    return { media, tab };
  };
  return {
    context,
    approved: await insert("approved", "approved"),
    pending: await insert("pending", "pending"),
  };
}

describe("fork guitar features on upstream v3", () => {
  let fixture: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    fixture = await setup();
  });

  it("only exposes approved tabs and keeps legacy URLs", async () => {
    const { context, approved } = fixture;
    expect(
      (await GuitarTabs.getGuitarTabsList(context, {})).items,
    ).toHaveLength(1);
    expect(await GuitarTabs.getGuitarTabBySlug(context, "pending")).toBeNull();
    expect(
      (await GuitarTabs.getGuitarTabBySlug(context, "old-approved"))?.tab.slug,
    ).toBe(approved.tab.slug);
    const listed = await call(router.list, {}, { context });
    expect(JSON.stringify(listed)).not.toContain(context.session.user.email);
    await expect(
      call(
        router.admin.review,
        { mediaId: approved.media.id, status: "rejected" },
        { context },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    vi.mocked(context.auth.api.getSession).mockResolvedValue(null);
    await expect(
      call(router.mine, undefined, { context }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("keeps comment threads and prevents cross-tab replies or unauthorized removal", async () => {
    const { context, approved, pending } = fixture;
    const root = await call(
      comments.create,
      { guitarTabId: approved.tab.id, content: "Root" },
      { context },
    );
    const reply = await call(
      comments.create,
      {
        guitarTabId: approved.tab.id,
        content: "Reply",
        replyToCommentId: root.id,
      },
      { context },
    );
    expect(
      (
        await call(comments.list, { guitarTabId: approved.tab.id }, { context })
      ).find((c) => c.id === reply.id)?.rootId,
    ).toBe(root.id);
    await expect(
      call(
        comments.create,
        { guitarTabId: pending.tab.id, content: "Hidden" },
        { context },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await context.db
      .update(Tabs)
      .set({ status: "approved" })
      .where(eq(Tabs.id, pending.tab.id));
    await expect(
      call(
        comments.create,
        {
          guitarTabId: pending.tab.id,
          content: "Wrong thread",
          replyToCommentId: root.id,
        },
        { context },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    vi.mocked(context.auth.api.getSession).mockResolvedValue({
      ...context.session,
      user: { ...context.session.user, id: "someone-else" },
    });
    await expect(
      call(
        comments.remove,
        { guitarTabId: approved.tab.id, id: root.id },
        { context },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    vi.mocked(context.auth.api.getSession).mockResolvedValue(context.session);
    await call(
      comments.remove,
      { guitarTabId: approved.tab.id, id: root.id },
      { context },
    );
    expect(await context.db.select().from(Comments)).toHaveLength(2);
    expect(
      (
        await call(comments.list, { guitarTabId: approved.tab.id }, { context })
      )[0],
    ).toMatchObject({ userId: null, content: "[评论已删除]" });
    await context.db
      .update(user)
      .set({ mutedAt: new Date() })
      .where(eq(user.id, context.session.user.id));
    await expect(
      call(
        comments.create,
        { guitarTabId: approved.tab.id, content: "Muted" },
        { context },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("protects guitar media, shared covers and uploaded avatars from cleanup", async () => {
    const { context, approved } = fixture;
    const [cover] = await context.db
      .insert(MediaTable)
      .values({
        key: "cover.png",
        url: "/images/cover.png",
        fileName: "cover.png",
        mimeType: "image/png",
        sizeInBytes: 100,
      })
      .returning();
    const [avatar] = await context.db
      .insert(MediaTable)
      .values({
        key: "avatars/user.png",
        url: "/images/avatars/user.png",
        fileName: "avatar.png",
        mimeType: "image/png",
        sizeInBytes: 100,
      })
      .returning();
    await context.db
      .update(Tabs)
      .set({ coverMediaId: cover.id })
      .where(eq(Tabs.id, approved.tab.id));
    await context.db
      .update(user)
      .set({ image: avatar.url })
      .where(eq(user.id, context.session.user.id));
    expect(await MediaRepo.getUnusedMediaKeys(context.db)).toEqual([]);
    expect((await Media.deleteImage(context, cover.key)).error?.reason).toBe(
      "MEDIA_IN_USE",
    );
    expect((await Media.deleteImage(context, avatar.key)).error?.reason).toBe(
      "MEDIA_IN_USE",
    );
    expect((await Media.deleteUnused(context)).data).toEqual({ count: 0 });
    expect(await context.db.select().from(MediaTable)).toHaveLength(4);
  });
});
