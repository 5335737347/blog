#!/usr/bin/env node
/**
 * 浏览器冒烟检查（Web）
 *
 * 为什么需要它：本轮前端改造中出现了两次「tsc --noEmit 与生产构建都通过、
 * 只有真实渲染才暴露」的缺陷——
 *   1. ShareActions 重复声明导致文章页运行时 500；
 *   2. 重写 Header 时漏掉 LazyMusicPlayer，音乐按钮只能换图标、打不开面板。
 * 静态检查无法覆盖这两类问题，所以把它们固化成可重复执行的检查。
 *
 * 用法：
 *   BASE_URL=http://127.0.0.1:3001 node scripts/smoke-web.mjs
 *
 * 前置条件：目标地址上的服务已在运行，且数据库可访问。
 * 通过 CDP 直接驱动本机已有的 Chromium（优先复用 Playwright 缓存），
 * 不引入任何 npm 依赖。
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3001";
const PORT = Number(process.env.CDP_PORT || 9511);
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 90000);

/**
 * 是否连着冒烟专用库跑。
 * 内容断言依赖冒烟库里的那篇文章；连开发库时数据不同，断言会误报，
 * 所以由 `npm run smoke`（自动播种）传 SMOKE_SEEDED=1 打开。
 */
const SEEDED = process.env.SMOKE_SEEDED === "1";
const SEEDED_TITLE = "冒烟测试文章";

const PAGES = [
  "/",
  "/articles",
  "/archive",
  ...(SEEDED ? ["/articles/smoke-post"] : []),
  "/about",
  "/now",
  "/messages",
  "/login",
  "/register",
  "/forgot-password",
  "/account",
];


/* ---------- 定位 Chromium ---------- */
function findChrome() {
  const candidates = [];
  if (process.env.CHROME_BIN) candidates.push(process.env.CHROME_BIN);
  const home = process.env.HOME || "";
  const cache = path.join(home, ".cache/ms-playwright");
  if (existsSync(cache)) {
    // 优先 headless shell：完整版 Chromium 在部分环境下会因 crashpad 初始化失败
    // 直接退出（chrome_crashpad_handler: --database is required），headless shell 不受影响。
    const dirs = readdirSync(cache);
    for (const dir of dirs.filter((d) => d.startsWith("chromium_headless_shell"))) {
      candidates.push(path.join(cache, dir, "chrome-headless-shell-linux64/chrome-headless-shell"));
    }
    for (const dir of dirs.filter((d) => d.startsWith("chromium-"))) {
      candidates.push(path.join(cache, dir, "chrome-linux64/chrome"));
      candidates.push(path.join(cache, dir, "chrome-linux/chrome"));
    }
  }
  for (const bin of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    candidates.push(bin);
  }
  return candidates.find((c) => c && (c.includes("/") ? existsSync(c) : true)) || null;
}

const chromeBin = findChrome();
if (!chromeBin) {
  console.error("未找到 Chromium。请设置 CHROME_BIN，或安装 Playwright 的 Chromium 缓存后重试。");
  process.exit(2);
}
// 启动失败时把二进制路径与 stderr 打出来，否则只能看到「CDP 未就绪」这样的空结论。
console.log(`使用浏览器：${chromeBin}`);

/* ---------- 极简 CDP 客户端 ---------- */
let ws;
let nextId = 1;
const pending = new Map();

function send(method, params = {}, sessionId) {
  const id = nextId++;
  const msg = { id, method, params };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP 超时: ${method}`));
      }
    }, 30000);
  });
}

const profileDir = mkdtempSync(path.join(tmpdir(), "kpblog-smoke-"));
const chrome = spawn(
  chromeBin,
  [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-crash-reporter",
    "--disable-breakpad",
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${PORT}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] }
);
const chromeStderr = [];
chrome.stderr.on("data", (d) => {
  if (chromeStderr.length < 20) chromeStderr.push(String(d).trim());
});
chrome.on("exit", (code) => {
  if (code !== null && code !== 0 && chromeStderr.length) {
    console.error(`Chromium 退出（code=${code}）：`);
    for (const line of chromeStderr.slice(-6)) console.error("  " + line.slice(0, 200));
  }
});

function cleanup(code) {
  try { chrome.kill(); } catch { /* ignore */ }
  try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(code);
}

let wsUrl = null;
for (let i = 0; i < 100; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    wsUrl = (await res.json()).webSocketDebuggerUrl;
    if (wsUrl) break;
  } catch { /* retry */ }
  await new Promise((r) => setTimeout(r, 200));
}
if (!wsUrl) {
  console.error("Chromium 未能启动（CDP 未就绪）");
  for (const line of chromeStderr.slice(-8)) console.error("  " + line.slice(0, 200));
  cleanup(2);
}

ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
});

async function evaluate(sessionId, expression) {
  const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text || "eval error");
  return res.result.value;
}

async function openPage() {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send("Network.enable", {}, sessionId);
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  return { targetId, sessionId };
}

async function closePage(target) {
  try { await send("Target.closeTarget", { targetId: target.targetId }); } catch { /* ignore */ }
}

/* ---------- 检查 ---------- */
const failures = [];
const check = (name, pass, detail = "") => {
  console.log(`${pass ? "  ✓" : "  ✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!pass) failures.push(`${name}${detail ? ": " + detail : ""}`);
};

console.log(`浏览器冒烟检查 → ${BASE}`);
console.log("");

/* 1. 每个页面：可渲染 + 无控制台错误 + 无失败请求 + 有 H1 */
console.log("页面渲染与控制台：");
for (const pagePath of PAGES) {
  const page = await openPage();
  const consoleErrors = [];
  const failedRequests = [];
  const onMessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.sessionId !== page.sessionId) return;
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      consoleErrors.push((m.params.args || []).map((a) => a.value ?? a.description).join(" ").slice(0, 160));
    }
    if (m.method === "Runtime.exceptionThrown") {
      consoleErrors.push("异常: " + String(m.params.exceptionDetails?.exception?.description || "").slice(0, 160));
    }
    // ERR_ABORTED 通常是导航/预取被取消（Next 的 App Router 会取消过期预取），
    // 不代表页面有缺陷。「页面没渲染出来」由下面的渲染轮询判定。
    if (
      m.method === "Network.loadingFailed" &&
      !/favicon/.test(m.params.errorText) &&
      !/ERR_ABORTED/.test(m.params.errorText)
    ) {
      failedRequests.push(m.params.errorText);
    }
  };
  ws.addEventListener("message", onMessage);

  let state = null;
  try {
    await send("Page.navigate", { url: BASE + pagePath }, page.sessionId);
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      state = await evaluate(page.sessionId, `(() => ({
        ready: document.readyState === 'complete',
        h1: (document.querySelector('h1') || {}).textContent?.trim().slice(0, 40) || null,
        elements: document.querySelectorAll('body *').length,
        busy: !!document.querySelector('[aria-busy="true"]'),
      }))()`);
      if (state.ready && state.elements > 12 && state.h1) break;
      await new Promise((r) => setTimeout(r, 300));
    }
  } catch (err) {
    consoleErrors.push(String(err.message || err));
  }
  ws.removeEventListener("message", onMessage);
  await closePage(page);

  const rendered = !!state?.h1 && (state?.elements ?? 0) > 12;
  const clean = consoleErrors.length === 0 && failedRequests.length === 0;
  check(`${pagePath}`, rendered && clean,
    [rendered ? null : `未渲染(h1=${state?.h1 ?? "无"}, el=${state?.elements ?? 0})`,
     consoleErrors.length ? `控制台: ${consoleErrors[0]}` : null,
     failedRequests.length ? `请求失败: ${failedRequests[0]}` : null].filter(Boolean).join(" | "));
}

/* 2. 首页内部链接可达性 */
console.log("\n内部链接：");
const linkPage = await openPage();
await send("Page.navigate", { url: BASE + "/" }, linkPage.sessionId);
await new Promise((r) => setTimeout(r, 1500));
const links = await evaluate(linkPage.sessionId, `(() => {
  const set = new Set();
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (href && href.startsWith('/') && !href.startsWith('//')) set.add(href.split('#')[0]);
  }
  return [...set];
})()`);
await closePage(linkPage);
const brokenLinks = [];
for (const href of links) {
  const res = await fetch(BASE + href, { redirect: "manual" }).catch(() => null);
  if (!res || res.status >= 400) brokenLinks.push(`${res ? res.status : "ERR"} ${href}`);
}
check(`首页 ${links.length} 个内部链接全部可达`, brokenLinks.length === 0, brokenLinks.slice(0, 5).join(", "));

/* 3. 关键组件确实渲染出来（针对历史回归） */
console.log("\n关键组件：");
const componentPage = await openPage();
await send("Page.navigate", { url: BASE + "/" }, componentPage.sessionId);
for (let i = 0; i < 40; i++) {
  const ready = await evaluate(componentPage.sessionId, `document.querySelectorAll('body *').length > 60`).catch(() => false);
  if (ready) break;
  await new Promise((r) => setTimeout(r, 300));
}
const headerButtons = await evaluate(componentPage.sessionId, `(() => {
  const labels = [...document.querySelectorAll('header button')].map(b => b.getAttribute('aria-label') || b.textContent.trim());
  return { labels, hasMusic: labels.some(l => l && l.includes('音乐')), hasTheme: labels.some(l => l === '主题切换') };
})()`);
check("头部渲染音乐与主题入口", headerButtons.hasMusic && headerButtons.hasTheme, JSON.stringify(headerButtons.labels));

// 音乐播放器：点击后必须真的出现面板（历史回归点）
const musicOpened = await evaluate(componentPage.sessionId, `(() => {
  const btn = [...document.querySelectorAll('header button')].find(b => (b.getAttribute('aria-label') || '').includes('音乐'));
  if (!btn) return 'no-button';
  btn.click();
  return 'clicked';
})()`);
let panelVisible = false;
for (let i = 0; i < 40; i++) {
  panelVisible = await evaluate(componentPage.sessionId, `!!document.getElementById('music-player-panel')`).catch(() => false);
  if (panelVisible) break;
  await new Promise((r) => setTimeout(r, 300));
}
check("点击音乐按钮后播放器面板出现", musicOpened === "clicked" && panelVisible, `click=${musicOpened} panel=${panelVisible}`);
await closePage(componentPage);

/* 4. 内容断言：确认渲染的是真实数据，而不是空状态 */
if (SEEDED) {
console.log("\n数据渲染：");
const contentPage = await openPage();
await send("Page.navigate", { url: BASE + "/" }, contentPage.sessionId);
for (let i = 0; i < 40; i++) {
  const ready = await evaluate(contentPage.sessionId, `document.querySelectorAll('body *').length > 60`).catch(() => false);
  if (ready) break;
  await new Promise((r) => setTimeout(r, 300));
}
// 轮询而不是读一次：ISR 的首次生成可能早于数据写入，页面要等下一个窗口才有内容。
let homeText = "";
for (let i = 0; i < 60; i++) {
  homeText = await evaluate(contentPage.sessionId, `document.body.innerText`).catch(() => "");
  if (homeText.includes(SEEDED_TITLE)) break;
  await send("Page.reload", { ignoreCache: true }, contentPage.sessionId).catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));
}
check("首页渲染出已发布文章", homeText.includes(SEEDED_TITLE), homeText.replace(/\s+/g, " ").slice(0, 80));

await send("Page.navigate", { url: BASE + "/articles/smoke-post" }, contentPage.sessionId);
for (let i = 0; i < 40; i++) {
  const h1 = await evaluate(contentPage.sessionId, `(document.querySelector('h1') || {}).textContent || ''`).catch(() => "");
  if (h1.includes(SEEDED_TITLE)) break;
  await new Promise((r) => setTimeout(r, 300));
}
const articleState = await evaluate(contentPage.sessionId, `(() => ({
  h1: (document.querySelector('h1') || {}).textContent?.trim() || null,
  hasToc: !!document.querySelector('nav[aria-label="文章目录"]'),
  tocLinks: document.querySelectorAll('nav[aria-label="文章目录"] a').length,
  codeBlocks: document.querySelectorAll('.markdown-code-frame').length,
  readingClass: !!document.querySelector('.reading'),
}))()`);
check("文章页渲染正文、目录与代码块",
  !!articleState.h1?.includes(SEEDED_TITLE) && articleState.hasToc && articleState.tocLinks >= 2 && articleState.codeBlocks >= 1,
  JSON.stringify(articleState));
await closePage(contentPage);
}

console.log(`\n结果：${failures.length === 0 ? "全部通过" : `${failures.length} 项失败`}`);
for (const f of failures) console.log(`  - ${f}`);
cleanup(failures.length === 0 ? 0 : 1);
