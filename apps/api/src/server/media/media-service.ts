import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { generateUniqueFilename } from "@/lib/utils";
import { badRequest, notFound } from "@/server/errors";
import { musicTrackSelect, toMusicTrackDto } from "./media-dto";

/**
 * 媒体服务。目前只有音乐：站点图片走外部图床（GitHub），
 * 本地上传/列举/删除图片的服务函数与端点已一并移除。
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
