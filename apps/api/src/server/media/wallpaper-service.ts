import { mkdir, writeFile } from "fs/promises";
import path from "path";
import type { Prisma } from "@prisma/client";
import type { HomeWallpaperDto } from "@kpblog/contracts";
import { prisma } from "@/lib/prisma";
import { generateUniqueFilename } from "@/lib/utils";
import { badRequest, notFound } from "@/server/errors";

/**
 * 首页壁纸轮换的后台管理。
 *
 * 壁纸文件与图片库共用 MEDIA_ROOT/images 静态目录，但登记在独立的
 * HomeWallpaper 表（启用状态 + 顺序），与封面/正文图的登记体系互不掺和。
 *
 * 首次访问自动播种仓库自带的 8 张默认壁纸；播种完成后写 Setting 标记，
 * 此后用户把列表删空也不会再触发重新播种——「删光」是一个合法的管理决策。
 */

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif)$/i;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/** 仓库自带的默认壁纸。与 apps/web/public/images/home/ 的文件一一对应。 */
const DEFAULT_WALLPAPERS = [
  "/images/home/wallpaper-01.webp",
  "/images/home/wallpaper-02.webp",
  "/images/home/wallpaper-03.webp",
  "/images/home/wallpaper-04.webp",
  "/images/home/wallpaper-05.webp",
  "/images/home/wallpaper-06.webp",
  "/images/home/wallpaper-07.webp",
  "/images/home/wallpaper-08.webp",
];

const SEED_MARKER_KEY = "home_wallpapers_seeded";

const wallpaperSelect = {
  id: true,
  url: true,
  enabled: true,
  sortOrder: true,
  createdAt: true,
} satisfies Prisma.HomeWallpaperSelect;

type WallpaperRecord = Prisma.HomeWallpaperGetPayload<{ select: typeof wallpaperSelect }>;

export function toWallpaperDto(wallpaper: WallpaperRecord): HomeWallpaperDto {
  return {
    id: wallpaper.id,
    url: wallpaper.url,
    enabled: wallpaper.enabled,
    sortOrder: wallpaper.sortOrder,
    createdAt: wallpaper.createdAt.toISOString(),
  };
}

function publicPath(...segments: string[]) {
  return path.join(
    process.env.MEDIA_ROOT || path.resolve(process.cwd(), "../web/public"),
    ...segments
  );
}

async function ensureSeeded() {
  const marker = await prisma.setting.findUnique({ where: { key: SEED_MARKER_KEY } });
  if (marker) return;

  // 先写标记再播种：并发首访时后来者看到标记即退出，宁可少播种也不重复。
  try {
    await prisma.setting.create({ data: { key: SEED_MARKER_KEY, value: "1" } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return;
    throw error;
  }
  try {
    await prisma.homeWallpaper.createMany({
      data: DEFAULT_WALLPAPERS.map((url, index) => ({ url, sortOrder: index })),
    });
  } catch (error) {
    // 个别 url 已存在（竞态）不致命：播种是尽力而为，管理员可手动补。
    if ((error as { code?: string }).code !== "P2002") throw error;
  }
}

export async function listWallpapers(options: { all?: boolean } = {}) {
  await ensureSeeded();
  const wallpapers = await prisma.homeWallpaper.findMany({
    where: options.all ? undefined : { enabled: true },
    orderBy: { sortOrder: "asc" },
    select: wallpaperSelect,
  });
  return wallpapers.map(toWallpaperDto);
}

export interface WallpaperFileInput {
  file: File | null;
}

export async function createWallpaperFromFile(input: WallpaperFileInput) {
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

  const last = await prisma.homeWallpaper.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const created = await prisma.homeWallpaper.create({
    data: { url: `/images/${filename}`, sortOrder: (last?.sortOrder ?? -1) + 1 },
    select: wallpaperSelect,
  });
  return toWallpaperDto(created);
}

export async function updateWallpaper(
  id: string,
  input: { enabled?: unknown }
) {
  const wallpaper = await prisma.homeWallpaper.findUnique({ where: { id } });
  if (!wallpaper) {
    throw notFound("壁纸不存在");
  }
  if (typeof input.enabled !== "boolean") {
    throw badRequest("没有需要修改的内容");
  }
  const updated = await prisma.homeWallpaper.update({
    where: { id },
    data: { enabled: input.enabled },
    select: wallpaperSelect,
  });
  return toWallpaperDto(updated);
}

/** 按传入的 id 顺序重排（缺省未列出的条目排在其后，保持相对顺序）。 */
export async function reorderWallpapers(input: { ids?: unknown }) {
  if (!Array.isArray(input.ids) || input.ids.some((id) => typeof id !== "string")) {
    throw badRequest("排序数据格式不正确");
  }
  const ids = input.ids as string[];
  const known = await prisma.homeWallpaper.findMany({ select: { id: true } });
  const knownIds = new Set(known.map((row) => row.id));
  const ordered = ids.filter((id) => knownIds.has(id));
  const rest = known
    .map((row) => row.id)
    .filter((id) => !ordered.includes(id))
    .sort();

  const finalOrder = [...ordered, ...rest];
  await prisma.$transaction(
    finalOrder.map((id, index) =>
      prisma.homeWallpaper.update({ where: { id }, data: { sortOrder: index } })
    )
  );

  return listWallpapers({ all: true });
}

/**
 * 把壁纸移出轮换。只删登记行，不删文件——壁纸文件可能仍被历史部署的
 * HTML 引用，且删错了难以恢复。
 */
export async function deleteWallpaper(id: string) {
  try {
    await prisma.homeWallpaper.delete({ where: { id } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") throw notFound("壁纸不存在");
    throw error;
  }
  return { deleted: true };
}
