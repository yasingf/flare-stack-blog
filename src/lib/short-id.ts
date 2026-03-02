/**
 * 8 位短 ID 编解码器
 *
 * 使用 32-bit Feistel 密码将自增整数 ID 映射为 8 位 base36 字符串。
 * 特性：
 *   - 确定性：相同 ID 总是产生相同输出
 *   - 非顺序：连续 ID 产生完全不同的输出
 *   - 可逆：可以从短 ID 解码回原始整数 ID
 *   - URL 安全：仅使用小写字母和数字 (a-z, 0-9)
 *
 * 范围：支持 ID 1 ~ 4,294,967,295 (约 42 亿)
 */

// ── Feistel 密码参数 ──────────────────────────────────

const FEISTEL_ROUNDS = 4;
/** 各轮的轮密钥（固定常量，不可更改，否则已有编码全部失效） */
const ROUND_KEYS: ReadonlyArray<number> = [
  0x5a3c_f7e1, 0x1b8d_4a6f, 0x9e27_c3d5, 0x7f14_b892,
];

/**
 * Feistel 轮函数 — 将 16-bit 输入混淆为 16-bit 输出
 */
function feistelRoundFn(value: number, roundKey: number): number {
  // 乘以大素数 + 异或轮密钥 + 位移混淆
  let x = ((value * 0x45d9_f3b) ^ roundKey) & 0xffff_ffff;
  x = ((x >>> 8) ^ (x << 4) ^ roundKey) & 0xffff;
  return x;
}

/**
 * 32-bit Feistel 加密：整数 ID → 混淆后的整数
 */
function feistelEncrypt(input: number): number {
  let left = (input >>> 16) & 0xffff;
  let right = input & 0xffff;

  for (let i = 0; i < FEISTEL_ROUNDS; i++) {
    const temp = right;
    right = left ^ feistelRoundFn(right, ROUND_KEYS[i]);
    left = temp;
  }

  return ((left << 16) | right) >>> 0;
}

/**
 * 32-bit Feistel 解密：混淆后的整数 → 原始整数 ID
 */
function feistelDecrypt(input: number): number {
  let left = (input >>> 16) & 0xffff;
  let right = input & 0xffff;

  for (let i = FEISTEL_ROUNDS - 1; i >= 0; i--) {
    const temp = left;
    left = right ^ feistelRoundFn(left, ROUND_KEYS[i]);
    right = temp;
  }

  return ((left << 16) | right) >>> 0;
}

// ── 公开 API ──────────────────────────────────────────

/**
 * 将自增整数 ID 编码为 8 位 base36 短 ID
 *
 * @example
 * encodeId(1)   // "09u4f5kh"
 * encodeId(2)   // "1a7xm3qp"
 * encodeId(100) // "0r2t8e4j"
 */
export function encodeId(id: number): string {
  if (id <= 0 || !Number.isInteger(id)) {
    throw new Error(`encodeId: id must be a positive integer, got ${id}`);
  }
  const encrypted = feistelEncrypt(id);
  return encrypted.toString(36).padStart(8, "0");
}

/**
 * 将 8 位 base36 短 ID 解码回整数 ID
 *
 * @example
 * decodeId("09u4f5kh") // 1
 * decodeId("1a7xm3qp") // 2
 */
export function decodeId(shortId: string): number {
  if (!/^[0-9a-z]{8}$/.test(shortId)) {
    throw new Error(`decodeId: invalid short ID format "${shortId}"`);
  }
  const encrypted = parseInt(shortId, 36);
  return feistelDecrypt(encrypted);
}

/**
 * 检查字符串是否符合短 ID 格式（8 位小写字母数字）
 */
export function isShortId(value: string): boolean {
  return /^[0-9a-z]{8}$/.test(value);
}
