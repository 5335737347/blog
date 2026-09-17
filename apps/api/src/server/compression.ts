import { brotliCompress, gzip } from "node:zlib";
import { promisify } from "node:util";
import type { FastifyInstance } from "fastify";

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

/**
 * 响应压缩。
 *
 * API 是独立进程，Next 的 rewrite 只转发不做压缩，所以在这之前
 * `/api/public/rss-data`（43 KB JSON）会原样进入浏览器。静态资源由 Next 处理、
 * 页面由 Nginx 处理，只有 JSON API 谁都没管。
 *
 * 设计取舍：
 * - 只在客户端声明支持时压缩，并始终声明 `Vary: Accept-Encoding`，避免缓存串味；
 * - 小于 1 KB 的响应不压（压缩后往往更大，还平白多一次 CPU 与分块开销）；
 * - 只压文本类 MIME，图片/音频本来就已经压缩过；
 * - 已经带 `Content-Encoding` 或不是 Buffer/string 的响应（流、multipart）不动；
 * - 压缩等级用默认值：目标是「别把 43 KB 原样发出去」，不是极限压缩率。
 *
 * **必须是 `app.addHook` 而不是 `app.register(plugin)`**：Fastify 的
 * `onSend` 钩子在**注册时刻**捕获当前上下文已有的钩子链，通过 `register`
 * 装进来的插件钩子不会回溯应用到之后注册的路由（实测：插件注册成功、
 * 钩子一次都没执行）。根实例上的钩子则对所有路由生效。
 */
const MIN_SIZE_BYTES = 1024;
const COMPRESSIBLE = /^(application\/(json|xml|javascript|manifest\+json)|text\/|image\/svg\+xml)/i;

function accepts(header: string | undefined, coding: "br" | "gzip"): boolean {
  if (!header) return false;
  return header
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .some((part) => {
      const [name, ...params] = part.split(";").map((value) => value.trim());
      if (name !== coding && name !== "*") return false;
      // q=0 表示明确不接受。
      return !params.some((param) => /^q=0(\.0+)?$/.test(param));
    });
}

export function registerCompression(app: FastifyInstance) {
  app.addHook("onSend", async (request, reply, payload) => {
    // 与具体编码无关：按 Accept-Encoding 变化的响应都必须声明 Vary。
    reply.header("vary", "Accept-Encoding");

    if (typeof payload !== "string" && !Buffer.isBuffer(payload)) return payload;
    if (reply.getHeader("content-encoding")) return payload;

    const contentType = String(reply.getHeader("content-type") ?? "");
    if (!COMPRESSIBLE.test(contentType)) return payload;

    const body = typeof payload === "string" ? Buffer.from(payload) : payload;
    if (body.length < MIN_SIZE_BYTES) return payload;

    const acceptEncoding = request.headers["accept-encoding"];
    const header = Array.isArray(acceptEncoding) ? acceptEncoding.join(",") : acceptEncoding;

    if (accepts(header, "br")) {
      const compressed = await brotliAsync(body);
      reply.header("content-encoding", "br");
      reply.header("content-length", compressed.length);
      return compressed;
    }
    if (accepts(header, "gzip")) {
      const compressed = await gzipAsync(body);
      reply.header("content-encoding", "gzip");
      reply.header("content-length", compressed.length);
      return compressed;
    }
    return payload;
  });
}
