import type { Hand } from "./score";
import type { PracticeResult } from "./practice";

export type LibraryItem = {
  id: string;
  title: string;
  fileName: string;
  file: Blob;
  addedAt: number;
};
export type Annotation = { finger?: string; hand?: Hand };
export type PracticeHistory = {
  date: number;
  title: string;
  seconds: number;
  speed: number;
  mode: string;
  result: PracticeResult;
};
const DB_NAME = "yasin-piano-v1";

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("scores", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("无法打开本机曲库，请检查浏览器存储权限。"));
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("scores", mode);
    const request = action(tx.objectStore("scores"));
    tx.oncomplete = () => {
      resolve(request.result);
      db.close();
    };
    tx.onerror = () => {
      reject(new Error("本机曲库保存失败，可能是存储空间不足。"));
      db.close();
    };
    tx.onabort = tx.onerror;
  });
}
export const listLocalScores = () =>
  transaction("readonly", (store) => store.getAll()) as Promise<LibraryItem[]>;
export const removeLocalScore = (id: string) =>
  transaction("readwrite", (store) => store.delete(id));
export async function saveLocalScore(file: File, title: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const id = [...new Uint8Array(digest)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  const item: LibraryItem = {
    id,
    title,
    fileName: file.name,
    file,
    addedAt: Date.now(),
  };
  await transaction("readwrite", (store) => store.put(item));
  return item;
}
export function readPreference<T>(key: string, fallback: T): T {
  try {
    return (
      JSON.parse(localStorage.getItem(`piano:${key}`) || "null") ?? fallback
    );
  } catch {
    return fallback;
  }
}
export function writePreference(key: string, value: unknown) {
  try {
    localStorage.setItem(`piano:${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function saveHistory(history: PracticeHistory) {
  const entries = readPreference<PracticeHistory[]>("history", []);
  return writePreference("history", [history, ...entries].slice(0, 100));
}
