import { orpc } from "@/lib/orpc";

export function mediaInfiniteQueryOptions(
  search: string = "",
  unusedOnly: boolean = false,
) {
  return orpc.media.list.infiniteOptions({
    input: (pageParam: number | undefined) => ({
      cursor: pageParam,
      search: search || undefined,
      unusedOnly: unusedOnly || undefined,
    }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function linkedPostsQuery(key: string) {
  return orpc.media.linkedPosts.queryOptions({
    input: { key },
    enabled: !!key,
  });
}

export const mediaStatsQuery = orpc.media.stats.queryOptions();

export const MEDIA_KEYS = {
  myGuitarTabs: ["media", "my-guitar-tabs"] as const,
};
export const approvedGuitarTabsCountQuery = () =>
  orpc.guitarTabs.count.queryOptions();
export function guitarTabMetaQuery(mediaId: number) {
  return orpc.guitarTabs.admin.meta.queryOptions({
    input: { mediaId },
    enabled: mediaId > 0,
  });
}
export function guitarTabsQueryOptions(search = "", page = 1, pageSize = 20) {
  return orpc.guitarTabs.list.queryOptions({
    input: { search: search || undefined, page, pageSize },
  });
}
export function myGuitarTabsQuery() {
  return orpc.guitarTabs.mine.queryOptions({
    queryKey: MEDIA_KEYS.myGuitarTabs,
  });
}
export function guitarTabDetailQuery(slug: string) {
  return orpc.guitarTabs.detail.queryOptions({
    input: { slug },
    enabled: !!slug,
    staleTime: 60_000,
  });
}
