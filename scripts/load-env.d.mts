/**
 * scripts/load-env.mjs 的类型声明。
 *
 * 该模块刻意是普通 ESM JavaScript（要同时被 node、tsx、Prisma CLI、Next 加载），
 * 因此类型单独声明，供 TypeScript 调用方使用。
 */

/** 仓库根目录，由模块自身位置推断，与 cwd 无关。 */
export declare const repositoryRoot: string;

/**
 * 加载 `.env.local` 与 `.env`（override: false，进程环境变量优先）。
 * 幂等。返回仓库根目录。
 */
export declare function loadProjectEnv(): string;

/** SQLite 数据库文件的绝对路径。DATABASE_URL 非 file: 时抛错。 */
export declare function databaseFilePath(): string;

/** 供 Prisma 使用的绝对 `file:` URL。 */
export declare function databaseUrl(): string;

/** 媒体目录的绝对路径，默认 apps/web/public。 */
export declare function mediaRootPath(): string;
