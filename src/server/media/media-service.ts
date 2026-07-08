import { mkdir, readdir, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
  generateUniqueFilename,
} from "@/lib/utils";
import { badRequest, notFound } from "@/server/errors";
import { musicTrackSelect, toMusicTrackDto } from "./media-dto";

const IMAGE_EXT_RE = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp3", "audio/webm"];
const AUDIO_EXT_RE = /\.(mp3|wav|ogg|webm)$/i;
const MAX_AUDIO_SIZE = 20 * 1024 * 1024;

export interface ImageItem {
  name: string;
  url: string;
  size: number;
  modified: string;
}

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
  return path.join(process.cwd(), "public", ...segments);
}

function trimmedString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function optionalText(value: unknown): string | null {
  return trimmedString(value) || null;
}

function isSafeFilename(filename: string | null): filename is string {
  return Boolean(
    filename && !filename.includes("..") && !filename.includes("/") && !filename.includes("\\")
  );
}

function assertSafeFilename(filename: string | null): asserts filename is string {
  if (!isSafeFilename(filename)) {
    throw badRequest("无效文件名");
  }
}

export async function uploadImage(file: File | null) {
  if (!file) {
    throw badRequest("请选择文件");
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw badRequest("不支持的文件类型，仅支持 JPEG/PNG/WebP/GIF");
  }

  if (file.size > MAX_IMAGE_SIZE) {
    throw badRequest("文件大小不能超过 5MB");
  }

  const filename = generateUniqueFilename(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadDir = publicPath("images");

  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), buffer);

  return { url: `/images/${filename}` };
}

export async function listImages(): Promise<ImageItem[]> {
  const dir = publicPath("images");
  const files = await readdir(dir).catch(() => [] as string[]);

  const images = await Promise.all(
    files
      .filter((file) => IMAGE_EXT_RE.test(file))
      .map(async (file) => {
        const filePath = path.join(dir, file);
        const fileStat = await stat(filePath);
        return {
          name: file,
          url: `/images/${file}`,
          size: fileStat.size,
          modified: fileStat.mtime.toISOString(),
        };
      })
  );

  return images.sort(
    (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
  );
}

export async function deleteImage(filename: string | null) {
  assertSafeFilename(filename);
  await unlink(publicPath("images", filename));
  return { deleted: true };
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
  if (!ALLOWED_AUDIO_TYPES.includes(file.type) && !AUDIO_EXT_RE.test(file.name)) {
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
