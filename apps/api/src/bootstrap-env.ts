import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

export const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

loadEnv({ path: path.join(repositoryRoot, ".env.local"), override: false, quiet: true });
loadEnv({ path: path.join(repositoryRoot, ".env"), override: false, quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl?.startsWith("file:./")) {
  process.env.DATABASE_URL = `file:${path.resolve(repositoryRoot, databaseUrl.slice("file:./".length))}`;
}

process.env.MEDIA_ROOT ||= path.join(repositoryRoot, "apps/web/public");
