import {
  generateHashKey,
  hashFileContent,
} from "@/features/media/media.utils";

export async function putToR2(env: Env, image: File, prefix?: string) {
  // 读取文件内容计算 SHA-256 哈希，生成基于内容哈希的 key
  const fileBuffer = await image.arrayBuffer();
  const fileHash = await hashFileContent(fileBuffer);
  const key = generateHashKey(fileHash, image.name, prefix);
  const contentType = image.type;
  const url = `/images/${key}`;

  // 检查 R2 中是否已存在相同哈希的文件（内容去重）
  const existing = await env.R2.head(key);
  if (!existing) {
    await env.R2.put(key, fileBuffer, {
      httpMetadata: {
        contentType,
      },
      customMetadata: {
        originalName: image.name,
      },
    });
  }

  return {
    key,
    url,
    fileName: image.name,
    mimeType: contentType,
    sizeInBytes: image.size,
  };
}

export async function deleteFromR2(env: Env, key: string) {
  await env.R2.delete(key);
}

export async function getFromR2(env: Env, key: string) {
  return await env.R2.get(key);
}
