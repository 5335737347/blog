import "dotenv/config";
import { defineConfig, env } from "prisma/config";

function normalizeSqliteUrl(url: string): string {
  if (url.startsWith("file:./") && !url.startsWith("file:./prisma/")) {
    return `file:./prisma/${url.slice("file:./".length)}`;
  }
  return url;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: normalizeSqliteUrl(env("DATABASE_URL")),
  },
});
