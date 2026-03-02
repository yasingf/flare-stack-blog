/**
 * GP7/8 文件内嵌音频客户端压缩器
 *
 * GP7/8 文件是 ZIP 压缩包，内含 Content/Assets/ 中的伴奏音频（通常 OGG）。
 * 此工具在客户端浏览器中运行，使用 WebCodecs AudioEncoder（GPU 加速）
 * 将大音频文件重新编码为低码率 Opus，保持 HQ 音质的同时大幅缩减体积。
 *
 * 流程：
 *   1. 用 fflate 解压 GP ZIP
 *   2. 找到 Content/Assets/ 中的音频文件
 *   3. 用 Web Audio API decodeAudioData() 解码为 PCM
 *   4. 用 WebCodecs AudioEncoder 编码为 Opus
 *   5. 封装为 OGG Opus 容器
 *   6. 替换原音频，重新打包 ZIP
 *
 * 浏览器要求：WebCodecs AudioEncoder（Chrome 94+, Edge 94+, Safari 16.4+）
 */

import { unzipSync, zipSync, type Zippable } from "fflate";

// ─── 类型 ─────────────────────────────────────────────

export interface GpCompressResult {
  /** 处理后的文件 */
  file: File;
  /** 原始大小 (bytes) */
  originalSize: number;
  /** 压缩后大小 (bytes) */
  compressedSize: number;
  /** 是否进行了压缩 */
  compressed: boolean;
  /** 压缩的音频文件 */
  audioFiles: Array<{
    path: string;
    originalSize: number;
    compressedSize: number;
  }>;
}

export interface GpCompressOptions {
  /** 音频最大目标大小 (bytes)，默认 6MB */
  maxAudioSize?: number;
  /** 进度回调 (0-1) */
  onProgress?: (progress: number) => void;
}

// ─── 常量 ──────────────────────────────────────────────

const ASSETS_PREFIX = "Content/Assets/";
const AUDIO_EXTENSIONS = [
  ".ogg",
  ".mp3",
  ".wav",
  ".flac",
  ".m4a",
  ".aac",
  ".opus",
  ".wma",
];
const DEFAULT_MAX_AUDIO_SIZE = 6 * 1024 * 1024; // 6 MB

// ─── 入口 ─────────────────────────────────────────────

/**
 * 检查文件是否需要压缩（GP7/8 ZIP 且包含大音频）
 */
export function needsCompression(file: File): boolean {
  // GP7/8 文件通常 > 10MB 才有大音频
  if (file.size <= 10 * 1024 * 1024) return false;
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  // 只有 .gp 格式是 ZIP（GP7/8），.gp3/.gp4/.gp5/.gpx 不是
  return ext === ".gp";
}

/**
 * 压缩 GP7/8 文件中的内嵌音频
 *
 * @returns 压缩结果。如果不需要压缩或不支持，返回原始文件。
 */
export async function compressGpFile(
  file: File,
  options: GpCompressOptions = {},
): Promise<GpCompressResult> {
  const { maxAudioSize = DEFAULT_MAX_AUDIO_SIZE, onProgress } = options;
  const originalSize = file.size;

  const noChange = (): GpCompressResult => ({
    file,
    originalSize,
    compressedSize: originalSize,
    compressed: false,
    audioFiles: [],
  });

  // 检查 WebCodecs 支持
  if (typeof AudioEncoder === "undefined") {
    console.warn("WebCodecs AudioEncoder not available, skipping compression");
    return noChange();
  }

  onProgress?.(0.05);

  // 读取文件
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);

  // 检查是否 ZIP（PK\x03\x04）
  if (
    data.length < 4 ||
    data[0] !== 0x50 ||
    data[1] !== 0x4b ||
    data[2] !== 0x03 ||
    data[3] !== 0x04
  ) {
    return noChange();
  }

  // 解压 ZIP
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data);
  } catch {
    return noChange();
  }

  onProgress?.(0.1);

  // 找到音频文件
  const audioEntries: Array<{ path: string; data: Uint8Array }> = [];
  for (const [path, content] of Object.entries(entries)) {
    if (isAudioAsset(path)) {
      audioEntries.push({ path, data: content });
    }
  }

  if (audioEntries.length === 0) return noChange();

  // 计算总音频大小
  const totalAudioSize = audioEntries.reduce(
    (sum, e) => sum + e.data.byteLength,
    0,
  );
  if (totalAudioSize <= maxAudioSize) return noChange();

  // 压缩每个音频文件
  const compressedAudioFiles: GpCompressResult["audioFiles"] = [];
  const outputEntries: Zippable = {};

  // 先放入非音频文件
  for (const [path, content] of Object.entries(entries)) {
    if (!isAudioAsset(path)) {
      outputEntries[path] = [content, { level: 6 }];
    }
  }

  // 计算每个音频文件的目标大小（按比例分配）
  const progressPerAudio = 0.8 / audioEntries.length;

  for (let i = 0; i < audioEntries.length; i++) {
    const entry = audioEntries[i]!;
    const targetSize = Math.floor(
      maxAudioSize * (entry.data.byteLength / totalAudioSize),
    );

    try {
      const compressed = await compressAudio(entry.data, targetSize, (p) => {
        onProgress?.(0.1 + (i + p) * progressPerAudio);
      });

      // 将路径扩展名改为 .ogg（Opus in OGG）
      const newPath = replaceExtension(entry.path, ".ogg");
      outputEntries[newPath] = [compressed, { level: 0 }]; // 已压缩，不再 deflate
      compressedAudioFiles.push({
        path: entry.path,
        originalSize: entry.data.byteLength,
        compressedSize: compressed.byteLength,
      });

      // 如果路径变了，更新 score.gpif 中的引用
      if (newPath !== entry.path && outputEntries["Content/score.gpif"]) {
        const gpifEntry = outputEntries["Content/score.gpif"] as [
          Uint8Array,
          { level: number },
        ];
        const xml = new TextDecoder().decode(gpifEntry[0]);
        const oldName = entry.path.slice(ASSETS_PREFIX.length);
        const newName = newPath.slice(ASSETS_PREFIX.length);
        const updatedXml = xml.replaceAll(oldName, newName);
        gpifEntry[0] = new TextEncoder().encode(updatedXml);
      }
    } catch (e) {
      console.warn(
        `Audio compression failed for ${entry.path}, keeping original:`,
        e,
      );
      outputEntries[entry.path] = [entry.data, { level: 0 }];
    }
  }

  onProgress?.(0.95);

  // 重新打包 ZIP
  try {
    const result = zipSync(outputEntries);
    const compressedFile = new File([result.buffer as ArrayBuffer], file.name, { type: file.type });

    onProgress?.(1);

    return {
      file: compressedFile,
      originalSize,
      compressedSize: result.byteLength,
      compressed: true,
      audioFiles: compressedAudioFiles,
    };
  } catch {
    return noChange();
  }
}

// ─── 音频压缩核心 ─────────────────────────────────────

/**
 * 将音频数据重新编码为 Opus（OGG 容器）
 * 使用 WebCodecs AudioEncoder 进行 GPU 加速编码
 */
async function compressAudio(
  audioData: Uint8Array,
  targetSize: number,
  onProgress?: (progress: number) => void,
): Promise<Uint8Array> {
  // 解码为 PCM
  const audioCtx = new AudioContext();
  try {
    const audioBuffer = await audioCtx.decodeAudioData(
      audioData.buffer.slice(0) as ArrayBuffer,
    );
    const duration = audioBuffer.duration;
    const sampleRate = Math.min(audioBuffer.sampleRate, 48000); // Opus 上限 48kHz
    const channels = Math.min(audioBuffer.numberOfChannels, 2); // 上限立体声

    // 计算目标码率（考虑 OGG 容器开销约 2%）
    const targetBitrate = Math.floor((targetSize * 0.98 * 8) / duration);
    // 限制在 48kbps - 192kbps（HQ 范围）
    const bitrate = Math.min(Math.max(targetBitrate, 48_000), 192_000);

    // 提取 PCM 数据并重采样（如果需要）
    const pcmChannels: Float32Array[] = [];
    for (let ch = 0; ch < channels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      if (sampleRate !== audioBuffer.sampleRate) {
        pcmChannels.push(
          resampleChannel(channelData, audioBuffer.sampleRate, sampleRate),
        );
      } else {
        pcmChannels.push(channelData);
      }
    }
    const totalSamples = pcmChannels[0]!.length;

    // 编码为 Opus
    const opusPackets: Array<{
      data: Uint8Array;
      timestamp: number;
      duration: number;
    }> = [];

    const encoder = new AudioEncoder({
      output(chunk) {
        const buf = new Uint8Array(chunk.byteLength);
        chunk.copyTo(buf);
        opusPackets.push({
          data: buf,
          timestamp: chunk.timestamp,
          duration: chunk.duration ?? 0,
        });
      },
      error(e) {
        console.error("AudioEncoder error:", e);
      },
    });

    encoder.configure({
      codec: "opus",
      sampleRate,
      numberOfChannels: channels,
      bitrate,
    });

    // 分段送入编码器（每段 20ms = 960 samples @ 48kHz）
    const frameSize = Math.floor(sampleRate * 0.02); // 20ms frames
    const totalFrames = Math.ceil(totalSamples / frameSize);

    for (let i = 0; i < totalFrames; i++) {
      const offset = i * frameSize;
      const length = Math.min(frameSize, totalSamples - offset);

      // 构建平面 PCM 缓冲区供 AudioData 使用
      const planarBuf = new Float32Array(length * channels);
      for (let ch = 0; ch < channels; ch++) {
        const src = pcmChannels[ch]!;
        for (let s = 0; s < length; s++) {
          planarBuf[ch * length + s] = src[offset + s] ?? 0;
        }
      }

      const frame = new AudioData({
        format: "f32-planar",
        sampleRate,
        numberOfFrames: length,
        numberOfChannels: channels,
        timestamp: Math.round((offset / sampleRate) * 1_000_000), // 微秒
        data: planarBuf,
      });

      encoder.encode(frame);
      frame.close();

      // 进度报告（编码阶段占总进度 0~0.8）
      if (i % 50 === 0) onProgress?.((i / totalFrames) * 0.8);
    }

    await encoder.flush();
    encoder.close();

    onProgress?.(0.9);

    // 封装为 OGG Opus 容器
    const oggData = buildOggOpus(opusPackets, sampleRate, channels, totalSamples);

    onProgress?.(1);
    return oggData;
  } finally {
    await audioCtx.close();
  }
}

// ─── 简单线性重采样 ───────────────────────────────────

function resampleChannel(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outputLen = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLen);
  for (let i = 0; i < outputLen; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, input.length - 1);
    const frac = srcIdx - lo;
    output[i] = input[lo]! * (1 - frac) + input[hi]! * frac;
  }
  return output;
}

// ─── OGG Opus 容器封装 ────────────────────────────────
//
// OGG Opus 规范：RFC 7845
// 结构：
//   Page 0: OpusHead（ID header）
//   Page 1: OpusTags（comment header）
//   Pages 2+: 音频数据
//
// 关键限制：每个 OGG page 最多 255 个 segment，每段最多 255 字节。
// 一个 Opus 包需要 floor(size/255)+1 个 segment。

/** Opus 编码器典型 pre-skip（312 samples @ 48kHz ≈ 6.5ms） */
const OPUS_PRE_SKIP = 312;
/** OGG page 最大 segment 数量 */
const MAX_SEGMENTS_PER_PAGE = 255;

/** 计算一个 Opus 包在 OGG segment table 中需要的 segment 数 */
function packetSegmentCount(packetSize: number): number {
  return Math.floor(packetSize / 255) + 1;
}

function buildOggOpus(
  packets: Array<{ data: Uint8Array; timestamp: number; duration: number }>,
  sampleRate: number,
  channels: number,
  _totalSamples: number,
): Uint8Array {
  const serialNo = Math.floor(Math.random() * 0xffffffff);
  const pages: Uint8Array[] = [];
  let pageSeqNo = 0;
  let granulePos = BigInt(OPUS_PRE_SKIP); // 从 pre-skip 开始计数

  // Page 0: OpusHead
  const opusHead = new Uint8Array(19);
  const headView = new DataView(opusHead.buffer);
  // "OpusHead"
  opusHead.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64]);
  opusHead[8] = 1; // version
  opusHead[9] = channels; // channel count
  headView.setUint16(10, OPUS_PRE_SKIP, true); // pre-skip (samples @ 48kHz)
  headView.setUint32(12, sampleRate, true); // input sample rate (informational)
  headView.setInt16(16, 0, true); // output gain
  opusHead[18] = 0; // channel mapping family

  pages.push(buildOggPage(opusHead, serialNo, pageSeqNo++, 0n, 0x02)); // BOS flag

  // Page 1: OpusTags
  const vendorStr = "flare-blog";
  const vendorBytes = new TextEncoder().encode(vendorStr);
  const opusTags = new Uint8Array(8 + 4 + vendorBytes.length + 4);
  const tagsView = new DataView(opusTags.buffer);
  // "OpusTags"
  opusTags.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73]);
  tagsView.setUint32(8, vendorBytes.length, true);
  opusTags.set(vendorBytes, 12);
  tagsView.setUint32(12 + vendorBytes.length, 0, true); // 0 comments

  pages.push(buildOggPage(opusTags, serialNo, pageSeqNo++, 0n, 0x00));

  // Audio data pages
  // 每页受 MAX_SEGMENTS_PER_PAGE (255) 限制，不能只看 payload 大小
  let pageBuf: Uint8Array[] = [];
  let pageSegments = 0;

  for (let i = 0; i < packets.length; i++) {
    const pkt = packets[i]!;
    const pktSegs = packetSegmentCount(pkt.data.byteLength);
    // 计算 granule（以 48kHz 为单位，OGG Opus 规范）
    const pktSamples =
      pkt.duration > 0
        ? Math.round((pkt.duration / 1_000_000) * 48000)
        : 960; // 默认 20ms

    // 如果加入此包会超出 segment 限制，先刷出当前页
    if (pageSegments + pktSegs > MAX_SEGMENTS_PER_PAGE && pageBuf.length > 0) {
      const combined = concatUint8Arrays(pageBuf);
      pages.push(
        buildOggPage(
          combined,
          serialNo,
          pageSeqNo++,
          granulePos, // 当前页最后一个包结尾的 granule
          0x00,
          pageBuf.map((b) => b.byteLength),
        ),
      );
      pageBuf = [];
      pageSegments = 0;
    }

    granulePos += BigInt(pktSamples);
    pageBuf.push(pkt.data);
    pageSegments += pktSegs;
  }

  // 最后一页（EOS）
  if (pageBuf.length > 0) {
    const combined = concatUint8Arrays(pageBuf);
    pages.push(
      buildOggPage(
        combined,
        serialNo,
        pageSeqNo++,
        granulePos,
        0x04, // EOS flag
        pageBuf.map((b) => b.byteLength),
      ),
    );
  }

  return concatUint8Arrays(pages);
}

/**
 * 构建一个 OGG 页面
 *
 * @param payload 页面数据
 * @param serialNo 流序列号
 * @param pageNo 页序号
 * @param granulePos 粒位置
 * @param headerType 头类型标志（BOS=0x02, EOS=0x04, continued=0x01）
 * @param segmentSizes 各段大小（用于多段合并），省略则整个 payload 作为一段
 */
function buildOggPage(
  payload: Uint8Array,
  serialNo: number,
  pageNo: number,
  granulePos: bigint,
  headerType: number,
  segmentSizes?: number[],
): Uint8Array {
  // 计算分段表
  const segments: number[] = [];
  if (segmentSizes) {
    for (const size of segmentSizes) {
      let remaining = size;
      while (remaining >= 255) {
        segments.push(255);
        remaining -= 255;
      }
      segments.push(remaining); // 终止段（< 255 表示包结束）
    }
  } else {
    let remaining = payload.byteLength;
    while (remaining >= 255) {
      segments.push(255);
      remaining -= 255;
    }
    segments.push(remaining);
  }

  const headerSize = 27 + segments.length;
  const page = new Uint8Array(headerSize + payload.byteLength);
  const view = new DataView(page.buffer);

  // OggS 魔数
  page.set([0x4f, 0x67, 0x67, 0x53]);
  page[4] = 0; // version
  page[5] = headerType;
  // granule position (64-bit LE)
  view.setBigInt64(6, granulePos, true);
  view.setUint32(14, serialNo, true);
  view.setUint32(18, pageNo, true);
  view.setUint32(22, 0, true); // CRC placeholder
  page[26] = segments.length;

  // 分段表
  for (let i = 0; i < segments.length; i++) {
    page[27 + i] = segments[i]!;
  }

  // 数据
  page.set(payload, headerSize);

  // 计算 CRC32 并写入
  const crc = oggCrc32(page);
  view.setUint32(22, crc, true);

  return page;
}

// ─── OGG CRC32（多项式 0x04C11DB7） ──────────────────

let oggCrcTable: Uint32Array | null = null;

function oggCrc32(data: Uint8Array): number {
  if (!oggCrcTable) {
    oggCrcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let r = i << 24;
      for (let j = 0; j < 8; j++) {
        r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
      }
      oggCrcTable[i] = r >>> 0;
    }
  }

  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc =
      ((crc << 8) ^ oggCrcTable[((crc >>> 24) ^ data[i]!) & 0xff]!) >>> 0;
  }
  return crc;
}

// ─── 工具函数 ─────────────────────────────────────────

function isAudioAsset(path: string): boolean {
  if (!path.startsWith(ASSETS_PREFIX)) return false;
  const lower = path.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function replaceExtension(path: string, newExt: string): string {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return path + newExt;
  return path.slice(0, dot) + newExt;
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((sum, a) => sum + a.byteLength, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.byteLength;
  }
  return result;
}
