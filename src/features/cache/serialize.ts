import type { CacheKey } from "./types";

/**
 * 将 CacheKey 序列化为字符串
 * 示例: ["posts", "list", "tech", 1] -> "posts:list:tech:1"
 */
export function serializeKey(key: CacheKey): string {
  if (typeof key === "string") return key;
  return key
    .map((k) => {
      if (k === null || k === undefined) return "_";
      return String(k);
    })
    .join(":");
}

/** Compare the JSON value stored in KV, independent of object field order. */
export function serializeCacheValue(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return item;
    }
    const record = item as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, record[key]]),
    );
  });
}
