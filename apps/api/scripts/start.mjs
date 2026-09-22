/**
 * 生产启动包装。
 *
 * `node dist/index.js` 本身不会设置 NODE_ENV；而 README 把 `npm run start:api`
 * 描述为生产启动。缺少 NODE_ENV 会让会话 Cookie 变成非 Secure、来源校验进入
 * 开发放宽、生产配置警告全部失效。这里在加载应用之前明确默认运行模式为
 * production；测试/开发仍走 `npm run dev` 或显式的 NODE_ENV，不会被覆盖。
 */
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

await import("../dist/index.js");
