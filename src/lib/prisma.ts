import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Simple in-memory cache for settings (avoids repeated DB queries)
let _settingsCache: Record<string, string> | null = null;
let _settingsCacheTime = 0;
const CACHE_TTL = 60_000; // 60 seconds

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
