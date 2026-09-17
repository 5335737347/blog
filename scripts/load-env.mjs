/**
 * 项目环境配置的唯一加载入口。
 *
 * 之前这段逻辑散在 8 个文件里，而且分成两套互不兼容的实现：
 * dotenv（API、Next、backup/restore、prisma.config）和一份手写正则解析器
 * （prisma/seed.ts、scripts/update.mjs、scripts/publish-note.mjs）。
 * 两者行为并不一致，差异都是静默的：
 *
 *   - `KEY=值 # 注释`：dotenv 剥掉注释，手写版把「# 注释」当成值的一部分；
 *   - `export KEY=值`：dotenv 支持，手写版整行匹配失败、直接忽略；
 *   - `KEY="a\nb"`：dotenv 展开转义，手写版原样保留；
 *   - 手写版用 `existsSync(".env.local")` 相对 **cwd** 找文件，
 *     换个目录执行就静默加载不到配置。
 *
 * 结果是「同一个 KEY，跑 seed 时和跑 API 时可能得到不同的值」。
 * 现在统一走 dotenv，并且仓库根目录由本模块自己推断，与调用方的 cwd 无关。
 *
 * 本文件刻意写成普通 ESM JavaScript（而非 TypeScript）：它要同时被
 * `node scripts/*.mjs`、tsx、Prisma CLI 和 Next 的配置文件加载，
 * 只有纯 JS 才能覆盖全部四种加载环境。类型声明见同目录 load-env.d.mts。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

/** 仓库根目录。由本文件位置推断，不依赖 cwd。 */
export const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

let loaded = false;

/**
 * 加载 `.env.local` 与 `.env`。
 *
 * 顺序与优先级：进程已有的环境变量最高（`override: false`），
 * 然后是 `.env.local`，最后是 `.env`。
 *
 * ⚠️ 空字符串同样算「已定义」：`.env.local` 里写 `KEY=""` 会挡住 `.env` 里的值。
 * 想让 `.env` 提供某个值，请在该文件里整行删除，而不是留空。
 *
 * 幂等：重复调用只会真正读取一次文件。
 */
export function loadProjectEnv() {
  if (loaded) return repositoryRoot;
  loaded = true;
  loadEnv({ path: path.join(repositoryRoot, ".env.local"), override: false, quiet: true });
  loadEnv({ path: path.join(repositoryRoot, ".env"), override: false, quiet: true });
  return repositoryRoot;
}

/**
 * SQLite 数据库文件的绝对路径。
 *
 * 之前每个调用方各自把 `file:./x` 归一化成不同形式（有的补 `prisma/` 前缀、
 * 有的转绝对路径），语义分歧正是「prisma migrate 和应用连到不同库」那个 bug 的根源。
 * 现在统一成绝对路径。
 */
export function databaseFilePath() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url?.startsWith("file:")) {
    throw new Error("DATABASE_URL 必须指向一个 SQLite 文件（file:...）。");
  }
  let relative = url.slice("file:".length);
  if (path.isAbsolute(relative)) return path.normalize(relative);
  // 历史写法 `file:./dev.db` 实际落在 prisma/ 下（见 .env.example）。
  if (relative.startsWith("./") && !relative.startsWith("./prisma/")) {
    relative = `./prisma/${relative.slice("./".length)}`;
  }
  return path.resolve(repositoryRoot, relative);
}

/** 供 Prisma 使用的绝对 `file:` URL。 */
export function databaseUrl() {
  return `file:${databaseFilePath()}`;
}

/**
 * 媒体目录的绝对路径。
 *
 * 默认 `apps/web/public`：既有的 /images 与 /music URL 依赖这个位置。
 * 与 apps/api/src/bootstrap-env.ts 的默认值保持一致。
 */
export function mediaRootPath() {
  const configured = process.env.MEDIA_ROOT?.trim();
  return configured
    ? path.resolve(repositoryRoot, configured)
    : path.join(repositoryRoot, "apps/web/public");
}
