import { mkdir, readdir, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { generateUniqueFilename } from "@/lib/utils";
import { badRequest, notFound } from "@/server/errors";
import { musicTrackSelect, toMusicTrackDto } from "./media-dto";

/**
 * 媒体服务：音乐（数据库记录，含外链）与封面图片（纯文件系统，无数据库）。
 *
 * 图片端点曾在切图床时被整体移除；2026-09-21 产品决定恢复本地图库，
 * 与音乐合并为后台「资源管理」页（文章仍可直接填外链 URL，两者共存）。
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

  const track = await prisma.music.create({
    data: {
      title: trimmedString(input.title) || file.name || "Unknown",
      artist: optionalText(input.artist),
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
  assertAllowedExternalUrl(url);

  const track = await prisma.music.create({
    data: {
      title,
      artist: optionalText(input.artist),
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

// ===== 封面图片 =====
//
// 与音乐不同，图片不进数据库：图库就是 MEDIA_ROOT/images 下的文件本身，
// 文章通过「封面图 URL」字段引用 /images/<name>。没有列表页之外的元数据
// 需要维护，也就没有删文章后残留引用的问题。

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif)$/i;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

export interface ImageFileInput {
  file: File | null;
}

export interface ImageInfo {
  name: string;
  url: string;
  size: number;
  modified: string;
}

export async function listImages(): Promise<ImageInfo[]> {
  let entries;
  try {
    entries = await readdir(publicPath("images"), { withFileTypes: true });
  } catch {
    // 目录还不存在（从未上传过）视为空图库，而不是让后台报错。
    return [];
  }

  const files = entries.filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name));
  const infos = await Promise.all(
    files.map(async (entry) => {
      const stats = await stat(publicPath("images", entry.name));
      return {
        name: entry.name,
        url: `/images/${entry.name}`,
        size: stats.size,
        modified: stats.mtime.toISOString(),
      };
    })
  );

  return infos.sort((a, b) => b.modified.localeCompare(a.modified));
}

export async function createImageFromFile(input: ImageFileInput): Promise<ImageInfo> {
  if (!input.file) {
    throw badRequest("请选择文件");
  }

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

  return {
    name: filename,
    url: `/images/${filename}`,
    size: buffer.length,
    modified: new Date().toISOString(),
  };
}

export async function deleteImage(name: unknown): Promise<{ deleted: true }> {
  // 文件名直接拼进路径，遍历检查（..、分隔符）+ 扩展名白名单缺一不可。
  if (typeof name !== "string" || !isSafeFilename(name) || !IMAGE_EXT_RE.test(name)) {
    throw badRequest("文件名不合法");
  }

  try {
    await unlink(publicPath("images", name));
  } catch {
    throw notFound("图片不存在");
  }

  return { deleted: true };
}
