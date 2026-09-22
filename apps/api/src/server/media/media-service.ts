import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import type { Prisma } from "@prisma/client";
import type { MediaImageDto } from "@kpblog/contracts";
import { prisma } from "@/lib/prisma";
import { generateUniqueFilename } from "@/lib/utils";
import { badRequest, notFound, ServiceError } from "@/server/errors";
import { musicTrackSelect, toMusicTrackDto } from "./media-dto";

/**
 * 媒体服务：音乐与图片都是「数据库登记行 + 可选本地文件」。
 *
 * 图片端点曾在切图床时被整体移除；2026-09-21 恢复图库并与音乐合并为后台
 * 「资源管理」页。2026-09-22 图片从纯文件系统升级为 MediaImage 登记表：
 * 历史文章的封面与正文图几乎都是外部图床（GitHub）URL，纯文件系统列表
 * 永远看不到它们；登记表让本地文件与外链统一入库，kind 区分封面与正文图。
 */

const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp3", "audio/webm"];
const AUDIO_EXT_RE = /\.(mp3|wav|ogg|webm)$/i;
const MAX_AUDIO_SIZE = 20 * 1024 * 1024;

export interface MusicFileInput {
  file: File | null;
  title?: unknown;
  artist?: unknown;
}

export interface MusicUrlInput {
  title?: unknown;
  artist?: unknown;
  url?: unknown;
}

function publicPath(...segments: string[]) {
  return path.join(process.env.MEDIA_ROOT || path.resolve(process.cwd(), "../web/public"), ...segments);
}

function trimmedString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function optionalText(value: unknown): string | null {
  return trimmedString(value) || null;
}

function assertAllowedExternalUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw badRequest("URL 格式不正确");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw badRequest("仅支持 http/https 音乐链接");
  }
}

function isSafeFilename(filename: string | null): filename is string {
  return Boolean(
    filename && !filename.includes("..") && !filename.includes("/") && !filename.includes("\\")
  );
}

export async function listMusicTracks() {
  const tracks = await prisma.music.findMany({
    orderBy: { createdAt: "desc" },
    select: musicTrackSelect,
  });

  return tracks.map(toMusicTrackDto);
}

export async function createMusicFromFile(input: MusicFileInput) {
  if (!input.file) {
    throw badRequest("请选择文件");
  }

  const { file } = input;
  if (!ALLOWED_AUDIO_TYPES.includes(file.type) || !AUDIO_EXT_RE.test(file.name)) {
    throw badRequest("不支持的文件类型，仅支持 MP3/WAV/OGG");
  }

  if (file.size > MAX_AUDIO_SIZE) {
    throw badRequest("文件大小不能超过 20MB");
  }

  const filename = generateUniqueFilename(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadDir = publicPath("music");

  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), buffer);

  const title = trimmedString(input.title) || file.name || "Unknown";
  const artist = optionalText(input.artist);
  if (title.length > 120 || (artist && artist.length > 120)) {
    throw badRequest("音乐标题或作者过长");
  }

  const track = await prisma.music.create({
    data: {
      title,
      artist,
      url: `/music/${filename}`,
    },
    select: musicTrackSelect,
  });

  return toMusicTrackDto(track);
}

export async function createMusicFromUrl(input: MusicUrlInput) {
  const title = trimmedString(input.title);
  const url = trimmedString(input.url);

  if (!title || !url) {
    throw badRequest("标题和 URL 不能为空");
  }
  if (title.length > 120 || url.length > 2048) {
    throw badRequest("音乐标题或 URL 过长");
  }
  const artist = optionalText(input.artist);
  if (artist && artist.length > 120) {
    throw badRequest("音乐作者过长");
  }
  assertAllowedExternalUrl(url);

  const track = await prisma.music.create({
    data: {
      title,
      artist,
      url,
    },
    select: musicTrackSelect,
  });

  return toMusicTrackDto(track);
}

export async function deleteMusicTrack(id: string) {
  const track = await prisma.music.findUnique({
    where: { id },
    select: musicTrackSelect,
  });

  if (!track) {
    throw notFound("音乐不存在");
  }

  if (track.url.startsWith("/music/")) {
    try {
      const filename = track.url.slice("/music/".length);
      if (isSafeFilename(filename)) {
        await unlink(publicPath("music", filename));
      }
    } catch {
      // The database row is authoritative; ignore a missing local file.
    }
  }

  await prisma.music.delete({ where: { id } });
  return { deleted: true };
}

// ===== 图片资源库 =====
//
// MediaImage 登记行为权威：url 可以是本地 /images/<file>（上传时生成），
// 也可以是外部图床地址（手工登记或从现有文章收编）。kind 区分封面与正文图，
// 只影响后台的分类展示，不影响任何渲染路径——文章端拿到的始终是 URL 字符串。

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif)$/i;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const IMAGE_KINDS = ["cover", "article"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

function isImageKind(value: unknown): value is ImageKind {
  return typeof value === "string" && (IMAGE_KINDS as readonly string[]).includes(value);
}

function requireImageKind(value: unknown): ImageKind {
  if (!isImageKind(value)) {
    throw badRequest("图片类型不正确，必须是 cover 或 article");
  }
  return value;
}

const imageSelect = {
  id: true,
  kind: true,
  name: true,
  url: true,
  createdAt: true,
} satisfies Prisma.MediaImageSelect;

type ImageRecord = Prisma.MediaImageGetPayload<{ select: typeof imageSelect }>;

export function toImageDto(image: ImageRecord): MediaImageDto {
  return {
    id: image.id,
    kind: image.kind,
    name: image.name,
    url: image.url,
    createdAt: image.createdAt.toISOString(),
  };
}

export interface ImageQuery {
  kind?: unknown;
}

export async function listImages(query: ImageQuery = {}) {
  let kind: ImageKind | undefined;
  if (query.kind !== undefined) {
    if (!isImageKind(query.kind)) {
      throw badRequest("图片类型不正确，必须是 cover 或 article");
    }
    kind = query.kind;
  }

  const rows = await prisma.mediaImage.findMany({
    where: kind ? { kind } : undefined,
    orderBy: { createdAt: "desc" },
    select: imageSelect,
  });
  return rows.map(toImageDto);
}

export interface ImageFileInput {
  file: File | null;
  kind?: unknown;
}

async function registerImage(kind: ImageKind, url: string, name: string) {
  if (!name || name.length > 200) {
    throw badRequest("图片名称不能为空且不能超过 200 个字符");
  }
  try {
    const row = await prisma.mediaImage.create({
      data: { kind, url, name },
      select: imageSelect,
    });
    return toImageDto(row);
  } catch (error) {
    // url 唯一：手工重复登记是用户错误（400），收编扫描则调用方自行跳过。
    if ((error as { code?: string }).code === "P2002") {
      throw badRequest("该图片地址已在库中");
    }
    throw error;
  }
}

export async function createImageFromFile(input: ImageFileInput) {
  if (!input.file) {
    throw badRequest("请选择文件");
  }
  const kind = requireImageKind(input.kind);

  const { file } = input;
  if (!ALLOWED_IMAGE_TYPES.includes(file.type) || !IMAGE_EXT_RE.test(file.name)) {
    throw badRequest("不支持的文件类型，仅支持 JPG/PNG/WebP/GIF/AVIF");
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw badRequest("文件大小不能超过 10MB");
  }

  const filename = generateUniqueFilename(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadDir = publicPath("images");

  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), buffer);

  return registerImage(kind, `/images/${filename}`, file.name || filename);
}

export interface ImageUrlInput {
  url?: unknown;
  kind?: unknown;
  name?: unknown;
}

/** 登记外部图床地址。url 全局唯一，重复登记报 400。 */
export async function createImageFromUrl(input: ImageUrlInput) {
  const url = typeof input.url === "string" ? input.url.trim() : "";
  if (!url) throw badRequest("URL 不能为空");
  if (url.length > 2048) throw badRequest("URL 过长");
  if (!/^https?:\/\//i.test(url)) throw badRequest("仅支持 http/https 图片地址");

  const kind = requireImageKind(input.kind);
  const name = (typeof input.name === "string" ? input.name.trim() : "") || nameFromUrl(url);
  return registerImage(kind, url, name);
}

function nameFromUrl(url: string) {
  try {
    const last = url.split("/").filter(Boolean).pop() ?? url;
    return decodeURIComponent(last).slice(0, 120) || url;
  } catch {
    return url;
  }
}

/** 封面按精确匹配；正文图按子串匹配（图片 URL 内联在 markdown content 里）。 */
async function countImageReferences(url: string, kind: ImageKind) {
  if (kind === "cover") {
    return prisma.post.count({ where: { coverImage: url } });
  }
  return prisma.post.count({ where: { content: { contains: url } } });
}

export async function deleteImage(id: string, options: { force?: boolean } = {}) {
  const image = await prisma.mediaImage.findUnique({ where: { id }, select: imageSelect });
  if (!image) {
    throw notFound("图片不存在");
  }

  if (!options.force) {
    const references = await countImageReferences(image.url, requireImageKind(image.kind));
    if (references > 0) {
      // 409 而不是 400：登记存在、但与文章的引用关系冲突；force 可越过。
      throw new ServiceError(`仍被 ${references} 篇文章引用`, 409, "CONFLICT");
    }
  }

  if (image.url.startsWith("/images/")) {
    const filename = image.url.slice("/images/".length);
    if (isSafeFilename(filename) && IMAGE_EXT_RE.test(filename)) {
      try {
        await unlink(publicPath("images", filename));
      } catch {
        // 数据库行为权威；文件已不在时不让删除流程失败。
      }
    }
  }

  await prisma.mediaImage.delete({ where: { id } });
  return { deleted: true };
}

// 正文里的 markdown 图片语法：![alt](url "title")。只取 url 段。
const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function isAdoptableImageUrl(url: string) {
  return /^https?:\/\//i.test(url) || url.startsWith("/images/");
}

export interface AdoptResult {
  covers: number;
  articles: number;
}

/**
 * 扫描全部文章，把 coverImage（封面类）与正文 markdown 图片 URL（文章图片类）
 * 收编进登记表。幂等：已在库中的 url 跳过；同一次扫描内也按 url 去重。
 * 收编只登记，不改动文章内容，也不下载任何文件。
 */
export async function adoptPostImages(): Promise<AdoptResult> {
  const posts = await prisma.post.findMany({
    select: { coverImage: true, content: true },
  });

  const seen = new Set<string>();
  const covers: { kind: ImageKind; url: string; name: string }[] = [];
  const articles: { kind: ImageKind; url: string; name: string }[] = [];

  for (const post of posts) {
    const cover = post.coverImage;
    if (cover && isAdoptableImageUrl(cover) && !seen.has(cover)) {
      seen.add(cover);
      covers.push({ kind: "cover", url: cover, name: nameFromUrl(cover) });
    }
    for (const match of post.content.matchAll(MARKDOWN_IMAGE_RE)) {
      const url = match[1];
      if (!isAdoptableImageUrl(url) || seen.has(url)) continue;
      seen.add(url);
      articles.push({ kind: "article", url, name: nameFromUrl(url) });
    }
  }

  const candidates = [...covers, ...articles];
  let newCovers = 0;
  let newArticles = 0;
  if (candidates.length > 0) {
    const existing = await prisma.mediaImage.findMany({
      where: { url: { in: candidates.map((item) => item.url) } },
      select: { url: true },
    });
    const known = new Set(existing.map((row) => row.url));
    const missing = candidates.filter((item) => !known.has(item.url));
    if (missing.length > 0) {
      await prisma.mediaImage.createMany({ data: missing });
    }
    // 返回的是「本次真正新收编」的数量：重复点收编按钮应看到 0，而不是虚报。
    newCovers = covers.filter((item) => !known.has(item.url)).length;
    newArticles = articles.filter((item) => !known.has(item.url)).length;
  }

  return { covers: newCovers, articles: newArticles };
}
