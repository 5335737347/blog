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
