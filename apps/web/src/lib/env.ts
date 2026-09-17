function cleanEnvValue(value: string | undefined): string {
  return value?.trim() ?? "";
}

let warnedAboutLocalSiteUrl = false;

/**
 * 是否处于 `next build` 的构建阶段。
 *
 * Next 在构建时设置 `NEXT_PHASE=phase-production-build`（见 next/dist/build/index.js）。
 * 构建期 NODE_ENV 也是 production，但本地构建使用 localhost 是完全正常的，
 * 不应该触发「生产配置错误」告警——否则每次本地构建都会刷一条吓人的错误。
 */
function isProductionBuild(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/**
 * 站点对外地址。用于 sitemap、canonical、Open Graph、JSON-LD 与 RSS。
 *
 * 之前缺失或非法时会静默返回空串，后果是：sitemap 变成空文件、
 * 所有 canonical 消失、robots 不再声明 sitemap —— 整套 SEO 面悄无声息地失效。
 * 这是纯粹的配置错误，直接抛错比产出坏数据更容易被发现。
 */
export function getSiteUrl(): string {
  const value = cleanEnvValue(process.env.SITE_URL);
  if (!value) {
    throw new Error(
      "SITE_URL 未设置。它是 sitemap、canonical、RSS 与 JSON-LD 的唯一来源，" +
        " 例如 SITE_URL=\"https://kpblog.cc\"。"
    );
  }

  let origin: string;
  try {
    origin = new URL(value).origin;
  } catch {
    throw new Error(`SITE_URL 不是合法的绝对 URL: ${JSON.stringify(value)}`);
  }

  // 真正在对外提供服务、却把本机地址写进 SITE_URL，是最危险的一种配置错误：
  // 站点能正常访问，但交给搜索引擎和社交平台的每个 URL 都是 localhost。
  //
  // 构建阶段跳过（本地构建用 localhost 很正常）；每个进程只提示一次。
  if (
    !isProductionBuild() &&
    process.env.NODE_ENV === "production" &&
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin) &&
    !warnedAboutLocalSiteUrl
  ) {
    warnedAboutLocalSiteUrl = true;
    console.warn(
      `[配置提醒] 当前以生产模式运行，但 SITE_URL 指向本机 (${origin})。` +
        "sitemap、canonical、RSS 与 JSON-LD 都会输出 localhost。" +
        "如果这只是本机验证，可以忽略；一旦对外提供服务，" +
        "请在部署环境的 .env 中设置 SITE_URL=https://kpblog.cc（注意 .env.local 优先级更高）。"
    );
  }

  return origin;
}

export function getOpenGraphImageUrl(): string {
  return cleanEnvValue(process.env.OG_IMAGE_URL);
}
