import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function databaseUrl(): string {
  const url = process.env.DATABASE_URL || "file:./prisma/dev.db";
  if (url.startsWith("file:./") && !url.startsWith("file:./prisma/")) {
    return `file:./prisma/${url.slice("file:./".length)}`;
  }
  return url;
}

const adapter = new PrismaBetterSqlite3({ url: databaseUrl() });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Simple in-memory cache for settings (avoids repeated DB queries)
let _settingsCache: Record<string, string> | null = null;
let _settingsCacheTime = 0;
const CACHE_TTL = 60_000; // 60 seconds

// Delete tags that have no posts
export async function cleanOrphanTags() {
  await prisma.tag.deleteMany({ where: { posts: { none: {} } } });
}

export async function getSettings(): Promise<Record<string, string>> {
  const now = Date.now();
  if (_settingsCache && now - _settingsCacheTime < CACHE_TTL) {
    return _settingsCache;
  }
  const rows = await prisma.setting.findMany();
  _settingsCache = Object.fromEntries(rows.map((s) => [s.key, s.value]));
  _settingsCacheTime = now;
  return _settingsCache;
}
