#!/usr/bin/env node
import { chmod, rm } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const destinationArg = process.argv[2];
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!destinationArg || !path.isAbsolute(destinationArg)) {
  throw new Error("SQLite backup destination must be an absolute path.");
}
if (!databaseUrl?.startsWith("file:")) {
  throw new Error("DATABASE_URL must point to SQLite before creating a backup.");
}

const destination = path.normalize(destinationArg);
const client = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
});

try {
  // SQLite creates a transactionally consistent standalone database snapshot.
  await client.$executeRawUnsafe("VACUUM INTO ?", destination);
  await chmod(destination, 0o600);
} catch (error) {
  await rm(destination, { force: true }).catch(() => {});
  throw error;
} finally {
  await client.$disconnect();
}
