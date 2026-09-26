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
import { accessSync, constants, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
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
  "/projects",
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

/**
 * 裸命令名（chromium 之类）必须真的能在 PATH 上执行。
 * 只判断「名字在候选表里」会让 spawn 抛未捕获的 ENOENT——
 * 服务器上首次运行就是这样崩掉的。
 *
 * 用文件系统检查而不是 `command -v`：后者要经 shell，会带出
 * 参数转义的隐患与 Node 的 DEP0190 警告。
 */
function resolvesOnPath(bin) {
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, bin);
    try {
      statSync(candidate);
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      /* 继续找下一个目录 */
    }
  }
  return false;
}

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
  // 系统安装的浏览器：必须实际存在于 PATH，不能只因为名字在候选表里就采用
  for (const bin of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    if (resolvesOnPath(bin)) candidates.push(bin);
  }
  return candidates.find((c) => c && (c.includes("/") ? existsSync(c) : true)) || null;
}

const chromeBin = findChrome();
if (!chromeBin) {
  // 这条信息要能让服务器上的运维直接照做，而不是给出一个无法执行的结论。
  console.error("未找到可用的 Chromium，浏览器冒烟无法执行。");
  console.error("");
  console.error("  安装方式（任选其一）：");
  console.error("    npx playwright install --with-deps chromium");
  console.error("    apt-get install -y chromium-browser   # 视发行版而定");
  console.error("");
  console.error("  装好后任选一种让它被找到：");
  console.error("    1) 把可执行文件路径写进 CHROME_BIN，例如");
  console.error("       export CHROME_BIN=\"$HOME/.cache/ms-playwright/chromium_headless_shell-*/");
  console.error("         chrome-headless-shell-linux64/chrome-headless-shell\"");
  console.error("       注意 PM2 的 env 也要带上，否则 npm run update 里仍然找不到。");
  console.error("    2) 或确认 chromium / google-chrome 在 PATH 上（which chromium）。");
  console.error("");
  console.error("  若确实无法安装浏览器，可在更新时跳过校验：");
  console.error("    npm run update -- --skip-check");
  console.error("    （这会同时跳过 lint、类型检查与全部测试，请谨慎使用。）");
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

async function waitFor(sessionId, expression, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(sessionId, expression)) return true;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

async function fill(sessionId, selector, value) {
  const set = evaluate(
    sessionId,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      const proto = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(element, ${JSON.stringify(value)});
      else element.value = ${JSON.stringify(value)};
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`
  );
  /* 水合竞态自愈：waitFor 只能确认 SSR 的输入框存在；若 fill 跑在 React
     附接 onChange 之前，水合会把受控输入重置回状态初值（空串），随后的
     提交就会以「请输入有效邮箱」这类校验错误假失败。满载服务器上水合
     可能数秒后才完成，单次重填不够——循环「填写 → 隔一拍 → 复查」直到
     值稳定为止（约 3 秒上限），水合一旦落定最后一次填写必然留存。 */
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((r) => setTimeout(r, 300));
    const persisted = await evaluate(
      sessionId,
      `document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`
    );
    if (persisted) return true;
    await evaluate(
      sessionId,
      `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return false;
        const proto = element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(element, ${JSON.stringify(value)});
        else element.value = ${JSON.stringify(value)};
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`
    );
  }
  return set;
}

/* 与 fill 同族：new-password 成对输入框的直填在水合前会被冲掉，
   循环「填写 → 复查」直到两个值都稳定留存。 */
async function fillNewPasswords(sessionId, value) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await evaluate(
      sessionId,
      `(() => {
        const inputs = [...document.querySelectorAll('input[autocomplete="new-password"]')];
        const setValue = (element, v) => {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
          if (setter) setter.call(element, v);
          else element.value = v;
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        };
        if (inputs[0]) setValue(inputs[0], ${JSON.stringify(value)});
        if (inputs[1]) setValue(inputs[1], ${JSON.stringify(value)});
        return inputs.length;
      })()`
    );
    await new Promise((r) => setTimeout(r, 300));
    const values = await evaluate(
      sessionId,
      `[...document.querySelectorAll('input[autocomplete="new-password"]')].map((i) => i.value)`
    );
    if (values.length >= 2 && values[0] === value && values[1] === value) return true;
  }
  return false;
}

async function click(sessionId, selector) {
  return evaluate(
    sessionId,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return false;
      element.click();
      return true;
    })()`
  );
}

async function clickByText(sessionId, text) {
  return evaluate(
    sessionId,
    `(() => {
      const element = [...document.querySelectorAll("button")].find((button) =>
        (button.textContent || "").includes(${JSON.stringify(text)})
      );
      if (!element) return false;
      element.click();
      return true;
    })()`
  );
}

async function fillByLabel(sessionId, labelText, value) {
  return evaluate(
    sessionId,
    `(() => {
      const label = [...document.querySelectorAll("label")].find((item) =>
        (item.textContent || "").includes(${JSON.stringify(labelText)})
      );
      if (!label || !label.htmlFor) return false;
      const element = document.getElementById(label.htmlFor);
      if (!element) return false;
      const proto = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(element, ${JSON.stringify(value)});
      else element.value = ${JSON.stringify(value)};
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`
  );
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

/* 桌面宽度下不应出现移动端菜单开关。

   历史缺陷（2026-09-25 生产实测）：`.icon-button` 是 globals.css 里的**无层**样式，
   而无层样式在级联中胜过 Tailwind 的 `@layer utilities`，于是
   `className="icon-button lg:hidden"` 里的 `lg:hidden` 完全失效——桌面宽度也会
   渲染菜单按钮。点开之后抽屉与遮罩（纯工具类，正常生效）在 lg 下被隐藏，
   但 Header 的 body 滚动锁已经生效，页面表现为「看得见、滚不动」，
   只有一个 × 留在头部。这里把「桌面不出现开关 + 页面仍可滚动」钉成断言。 */
const desktopHeader = await evaluate(componentPage.sessionId, `(() => {
  const toggle = document.querySelector('button[aria-controls="mobile-menu"]');
  const visible = (el) => !!el && el.getClientRects().length > 0
    && getComputedStyle(el).display !== 'none'
    && getComputedStyle(el).visibility !== 'hidden';
  return {
    toggleVisible: visible(toggle),
    toggleLabel: toggle ? (toggle.getAttribute('aria-label') || '') : null,
    bodyOverflow: getComputedStyle(document.body).overflow,
    scrollable: document.documentElement.scrollHeight > window.innerHeight,
  };
})()`);
check(
  "桌面宽度不出现移动端菜单开关，且页面未被滚动锁冻结",
  desktopHeader.toggleVisible === false && desktopHeader.bodyOverflow !== "hidden",
  JSON.stringify(desktopHeader)
);

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

/* 3b. 主题切换：改版后所有颜色都走令牌，必须确认两种模式都能真正切过去。
   用独立页面并在结束时清掉偏好，避免影响后续断言。 */
const themeOpened = await evaluate(componentPage.sessionId, `(() => {
  const btn = [...document.querySelectorAll('header button')].find(b => b.getAttribute('aria-label') === '主题切换');
  if (!btn) return 'no-button';
  btn.click();
  return 'clicked';
})()`);
await new Promise((r) => setTimeout(r, 250));
const darkPicked = await evaluate(componentPage.sessionId, `(() => {
  const items = [...document.querySelectorAll('#theme-menu [role="menuitemradio"]')];
  const dark = items.find(b => b.textContent.includes('黑暗'));
  if (!dark) return 'no-item';
  dark.click();
  return 'clicked';
})()`);
await new Promise((r) => setTimeout(r, 300));
const themeState = await evaluate(componentPage.sessionId, `({
  dark: document.documentElement.classList.contains('dark'),
  stored: localStorage.getItem('theme'),
  bodyBg: getComputedStyle(document.body).backgroundColor,
})`);
check("主题可切换到暗色并写入偏好",
  themeOpened === "clicked" && darkPicked === "clicked" && themeState.dark === true &&
    themeState.stored === "dark" && themeState.bodyBg !== "rgb(255, 255, 255)",
  JSON.stringify(themeState));
// 还原，避免污染同一次运行里的其它页面
await evaluate(componentPage.sessionId, `(() => { localStorage.removeItem('theme'); document.documentElement.classList.remove('dark'); return true; })()`).catch(() => {});
await closePage(componentPage);

/* 3c. 阅读器交互：目录滚动联动、移动端目录抽屉、代码复制、图片放大。
   这些是本轮改版的核心交互，也都是「渲染正常但点了没反应」的典型位置。 */
console.log("\n阅读器交互：");
const readerPage = await openPage();
const gotoArticle = async () => {
  await send("Page.navigate", { url: BASE + "/articles/smoke-post" }, readerPage.sessionId);
  for (let i = 0; i < 40; i++) {
    const ok = await evaluate(readerPage.sessionId, `!!document.querySelector('nav[aria-label="文章目录"]')`).catch(() => false);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
};

const tocReady = await gotoArticle();
if (!tocReady) {
  check("文章页目录可见（桌面）", false, "目录未渲染，后续交互检查跳过");
} else {
  // 目录滚动联动高亮
  /**
   * 滚动到第二节并等待目录高亮。
   *
   * 这里必须**条件轮询**而不是「滚动 + 固定等待」：高亮由 IntersectionObserver
   * 驱动，回调时机取决于滚动与观察者的注册顺序，固定等待在负载高的机器上会
   * 偶发失败（服务器第一次跑 smoke:prod 就是这样挂的，报「当前项=null」，
   * 而交互断言与数据断言全部通过——典型的时序问题，不是功能缺陷）。
   * 轮询窗口给到 ~10 秒，真出问题时仍然会失败，只是不再拿时序赌结果。
   *
   * 2026-09-21 第二次假失败：只滚动一次仍不够——滚完后懒加载图片等造成的
   * 布局位移会把目标标题推出观察带，10 秒轮询也只会一直查一个已经失效的
   * 滚动位置。改为每轮轮询都重发一次滚动：真实用户的滚动是连续的，
   * 高亮终会跟上。
   */
  const scrollSnippet = `(() => {
    const sections = document.querySelectorAll('.reading h2');
    const target = sections[1] || sections[0];
    if (!target) return { found: false, sections: sections.length };
    // 让标题落在视口顶部约 120px 处：目录高亮用的 IntersectionObserver
    // 观察带是 -96px 0px -70% 0px，标题若停在 96px 以内会被判为「不在带内」，
    // 高亮就不会更新——这是断言曾经的假失败来源（真实用户滚动时几乎不会正好停在那一小段）。
    const top = target.getBoundingClientRect().top + window.scrollY - 120;
    window.scrollTo(0, Math.max(0, top));
    return { found: true, sections: sections.length, target: target.textContent.trim().slice(0, 20) };
  })()`;
  let scrolled = await evaluate(readerPage.sessionId, scrollSnippet).catch(() => null);
  let activeToc = null;
  for (let i = 0; i < 40; i += 1) {
    activeToc = await evaluate(readerPage.sessionId, `(() => {
      const cur = document.querySelector('nav[aria-label="文章目录"] a[aria-current="location"]');
      return cur ? cur.textContent.trim().slice(0, 30) : null;
    })()`).catch(() => null);
    if (activeToc) break;
    scrolled = await evaluate(readerPage.sessionId, scrollSnippet).catch(() => scrolled);
    await new Promise((r) => setTimeout(r, 250));
  }
  check(
    "目录随滚动高亮当前小节",
    !!activeToc,
    `当前项=${activeToc} 滚动目标=${scrolled?.target ?? "无"} 小节数=${scrolled?.sections ?? 0}`
  );

  // 代码块复制。无头环境通常拒绝剪贴板写入（非用户手势 / 无权限），
  // 因此成功与失败两种反馈都算通过——要断言的是「点击真的触发了处理并给出反馈」，
  // 而不是剪贴板内容。真正的复制行为在本地手动验证过（能读到剪贴板文本）。
  const copyState = await evaluate(readerPage.sessionId, `(() => {
    const btn = document.querySelector('.markdown-copy-button');
    if (!btn) return { clicked: false };
    btn.click();
    return { clicked: true };
  })()`);
  let copyLabel = null;
  for (let i = 0; i < 20; i++) {
    copyLabel = await evaluate(readerPage.sessionId, `document.querySelector('.markdown-copy-button')?.getAttribute('aria-label') || null`).catch(() => null);
    if (copyLabel && copyLabel !== "复制代码") break;
    await new Promise((r) => setTimeout(r, 250));
  }
  check("代码块复制按钮产生可见反馈",
    copyState.clicked && (copyLabel === "代码已复制" || copyLabel === "复制失败"),
    `label=${copyLabel}`);

  // 长代码可键盘聚焦（axe 曾报过滚动区不可聚焦）。
  //
  // 这里**不再要求 `aria-label`**：`pre` 没有可承载名称的角色，写在上面的
  // `aria-label` 会被辅助技术忽略（axe aria-prohibited-attr），已随可访问性
  // 修复移除；语言信息由代码块头部那段可见文本提供。
  const codeFocusable = await evaluate(readerPage.sessionId, `(() => {
    const pre = document.querySelector('.markdown-code-frame pre');
    if (!pre) return null;
    return {
      tabindex: pre.getAttribute('tabindex'),
      languageLabel: !!document.querySelector('.markdown-code-frame .markdown-code-language'),
    };
  })()`);
  check(
    "代码块滚动区可键盘聚焦且带语言标签",
    codeFocusable !== null && codeFocusable.tabindex === '0' && codeFocusable.languageLabel === true,
    `tabindex=${codeFocusable?.tabindex} language=${codeFocusable?.languageLabel}`
  );
}

// 移动端目录抽屉（窄视口下桌面目录隐藏、浮动按钮出现）
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, readerPage.sessionId);
await gotoArticle();
// 打开抽屉：轮询期间反复补点。页面刚加载完就评估时 React 可能尚未 hydration
// 完成，第一发 click 会落在没有任何监听的按钮上——2026-09-21 生产冒烟因此
// 连续两次假失败（{"open":false}，5 秒轮询等不到抽屉）。抽屉出现即停。
let drawer = { open: false };
let drawerButtonFound = false;
for (let i = 0; i < 20; i++) {
  drawerButtonFound = await evaluate(readerPage.sessionId, `(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-controls') === 'toc-drawer');
    if (!btn) return false;
    btn.click();
    return true;
  })()`).catch(() => false);
  drawer = await evaluate(readerPage.sessionId, `(() => {
    const d = document.getElementById('toc-drawer');
    return d ? { open: true, links: d.querySelectorAll('a').length } : { open: false };
  })()`).catch(() => ({ open: false }));
  if (drawer.open) break;
  await new Promise((r) => setTimeout(r, 250));
}
check("移动端可打开目录抽屉", drawerButtonFound && drawer.open && drawer.links >= 2, JSON.stringify(drawer));

// 抽屉里的链接应能关闭抽屉并跳转。与打开抽屉同理，点击可能落在
// hydration 完成之前而丢失：轮询补点，直到抽屉卸载为止。
const drawerNav = await evaluate(readerPage.sessionId, `(() => {
  const a = document.querySelector('#toc-drawer a');
  if (!a) return { clicked: false };
  a.click();
  return { clicked: true, href: a.getAttribute('href') };
})()`);
let drawerClosed = false;
for (let i = 0; i < 12; i++) {
  drawerClosed = await evaluate(readerPage.sessionId, `(() => {
    if (!document.getElementById('toc-drawer')) return true;
    const a = document.querySelector('#toc-drawer a');
    if (a) a.click();
    return false;
  })()`).catch(() => false);
  if (drawerClosed) break;
  await new Promise((r) => setTimeout(r, 250));
}
check("点击目录项后抽屉关闭", drawerNav.clicked && drawerClosed, JSON.stringify({ ...drawerNav, drawerClosed }));

/**
 * RSS 自动发现链接必须在（这是曾经真实失效过的项）。
 *
 * 根布局声明了 `<link rel="alternate" type="application/rss+xml">`，但 Next 的
 * metadata 是浅合并：页面导出自己的 `alternates`（通常只为写 canonical）会整体
 * 替换布局里的那一份，于是这个链接在**所有页面上都消失**（线上实测 5 个页面全为 0）。
 * 订阅器与浏览器扩展就再也发现不了 feed。
 */
const rssAlternate = await evaluate(readerPage.sessionId, `(() => {
  const link = document.querySelector('link[rel="alternate"][type="application/rss+xml"]');
  return { found: !!link, href: link ? link.getAttribute('href') : null };
})()`);
check(
  "页面声明了 RSS 自动发现链接",
  rssAlternate.found === true && /\/rss\.xml$/.test(rssAlternate.href || ""),
  JSON.stringify(rssAlternate)
);

/**
 * 移动端导航只有一套。
 *
 * 底部标签栏与头部汉堡菜单曾经指向同一批目标（首页/文章/归档/留言/关于
 * vs 文章/归档/个人介绍/近况/留言），小屏上出现两套等价导航，已移除标签栏。
 * 这条断言防止它被无意间加回来。
 */
const navSurfaces = await evaluate(readerPage.sessionId, `(() => {
  const labels = [...document.querySelectorAll('nav')].map((n) => n.getAttribute('aria-label') || '');
  return {
    labelled: labels.filter(Boolean),
    fixedBottom: [...document.querySelectorAll('nav')].filter((n) => {
      const cs = getComputedStyle(n);
      return cs.position === 'fixed' && parseInt(cs.bottom || '9999', 10) <= 4;
    }).length,
    menuButton: !!document.querySelector('button[aria-controls="mobile-menu"]'),
  };
})()`);
check(
  "移动端只有一套导航（无底部标签栏，菜单入口仍在）",
  navSurfaces.fixedBottom === 0 && navSurfaces.menuButton === true,
  JSON.stringify(navSurfaces)
);

await closePage(readerPage);

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

/* 5. 浏览器认证与表单流程：登录、留言提交、管理员登录与未登录跳转 */
console.log("\n认证与表单流程：");
const flowPage = await openPage();

await send("Page.navigate", { url: BASE + "/login" }, flowPage.sessionId);
await waitFor(flowPage.sessionId, `!!document.querySelector('input[autocomplete="username"]')`);
await fill(flowPage.sessionId, 'input[autocomplete="username"]', "smoke-user");
await fill(flowPage.sessionId, 'input[autocomplete="current-password"]', "smoke-user-password");
await click(flowPage.sessionId, 'form button[type="submit"]');
const userLoggedIn = await waitFor(
  flowPage.sessionId,
  `location.pathname === "/" && document.body.innerText.includes("冒烟用户")`,
  15000
);
check("用户登录后头部立即显示账号", userLoggedIn);

await send("Page.navigate", { url: BASE + "/messages" }, flowPage.sessionId);
await waitFor(flowPage.sessionId, `!!document.querySelector('textarea[aria-label="留言内容"]')`);
// 等 CommentSection 读到会话，确认表单切换成登录身份；否则会走匿名分支。
await waitFor(flowPage.sessionId, `document.body.innerText.includes("以 冒烟用户 身份留言")`, 8000);
await fill(flowPage.sessionId, 'textarea[aria-label="留言内容"]', "冒烟浏览器留言");
await click(flowPage.sessionId, 'form[data-print="hide"] button[type="submit"]');
const commentSubmitted = await waitFor(
  flowPage.sessionId,
  `document.body.innerText.includes("留言已提交")`,
  10000
);
check("用户提交留言后出现待审核提示", commentSubmitted);

await send("Network.clearBrowserCookies", {}, flowPage.sessionId);
await send("Page.navigate", { url: BASE + "/admin/login?redirect=%2Fadmin%2Fcomments" }, flowPage.sessionId);
await waitFor(flowPage.sessionId, `!!document.querySelector('input[autocomplete="username"]')`);
await fill(flowPage.sessionId, 'input[autocomplete="username"]', "smoke-admin");
await fill(flowPage.sessionId, 'input[autocomplete="current-password"]', "smoke-admin-password");
await click(flowPage.sessionId, 'form button[type="submit"]');
const adminLoggedIn = await waitFor(
  flowPage.sessionId,
  `location.pathname === "/admin/comments" && document.body.innerText.includes("评论审核")`,
  15000
);
check("管理员登录后按 redirect 进入后台目标页", adminLoggedIn);

/* hero 之上的账号区必须可读。

   历史缺陷（2026-09-25 生产实测）：AuthNav 用的是为浅色背景选的深色
   （显示名 text-ink-2、管理/退出 .btn-text），而首页头部背后是深色压暗层，
   显示名几乎不可见。这条断言把「登录态账号区 = 不透明白字」钉住。 */
await send("Page.navigate", { url: BASE + "/" }, flowPage.sessionId);
await waitFor(flowPage.sessionId, `document.body.innerText.includes("鲲鹏")`, 10000);
/* 账号区自 2026-09-26 起是单个下拉触发器（👤 显示名 ▾），菜单里才是
   账号中心 / 管理后台 / 退出登录。断言分两层：
   1) hero 态下触发器必须是不透明白字（原可读性意图不变）；
   2) 展开菜单后菜单项必须是常规墨色——globals.css 的 data-over-hero
      白字规则若染白了白底菜单，会在这里以「白字菜单项」暴露。 */
const authContrast = await evaluate(flowPage.sessionId, `(() => {
  const box = document.querySelector('.header-auth');
  if (!box) return { found: false };
  const trigger = box.querySelector('button[aria-controls="auth-menu"]');
  if (!trigger) return { found: true, trigger: false };
  return {
    found: true,
    trigger: true,
    overHero: !!document.querySelector('header[data-over-hero]'),
    label: (trigger.textContent || '').trim(),
    color: getComputedStyle(trigger).color,
  };
})()`);
await evaluate(flowPage.sessionId, `(() => {
  const trigger = document.querySelector('.header-auth button[aria-controls="auth-menu"]');
  if (trigger) trigger.click();
  return !!trigger;
})()`);
await new Promise((r) => setTimeout(r, 400));
const authMenu = await evaluate(flowPage.sessionId, `(() => {
  const menu = document.getElementById('auth-menu');
  if (!menu) return { open: false };
  const items = [...menu.querySelectorAll('a, button')];
  return {
    open: true,
    labels: items.map((n) => (n.textContent || '').trim()),
    whiteItems: items.filter((n) => getComputedStyle(n).color === "rgb(255, 255, 255)").length,
  };
})()`);
await evaluate(flowPage.sessionId, `document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
check(
  "hero 之上的账号区使用不透明白字（可读性）",
  authContrast.found === true &&
    authContrast.trigger === true &&
    authContrast.overHero === true &&
    authContrast.color === "rgb(255, 255, 255)",
  JSON.stringify(authContrast)
);
check(
  "账号下拉菜单展开含完整条目且不被白字规则染白",
  authMenu.open === true &&
    authMenu.labels.includes("账号中心") &&
    authMenu.labels.includes("管理后台") &&
    authMenu.labels.includes("退出登录") &&
    authMenu.whiteItems === 0,
  JSON.stringify(authMenu)
);

// 后台文章表单：创建草稿 → 详情页 → 修改标题 → 后台列表可见。
if (adminLoggedIn) {
  const createdTitle = "冒烟后台文章";
  const updatedTitle = "冒烟后台文章（已更新）";
  await send("Page.navigate", { url: BASE + "/admin/articles/new" }, flowPage.sessionId);
  await waitFor(flowPage.sessionId, `!!document.getElementById("标题-*")`, 10000);
  await waitFor(flowPage.sessionId, `!!(document.querySelector("textarea.w-md-editor-text-input") || document.querySelector("[data-color-mode] textarea"))`, 10000);
  await fillByLabel(flowPage.sessionId, "标题", createdTitle);
  await evaluate(
    flowPage.sessionId,
    `(() => {
      const element = document.querySelector("textarea.w-md-editor-text-input") || document.querySelector("[data-color-mode] textarea");
      if (!element) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (setter) setter.call(element, "# 后台冒烟正文\\n\\n用于验证后台文章表单。");
      else element.value = "# 后台冒烟正文\\n\\n用于验证后台文章表单。";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`
  );
  await clickByText(flowPage.sessionId, "保存草稿");
  const created = await waitFor(
    flowPage.sessionId,
    `(() => {
      const parts = location.pathname.split("/").filter(Boolean);
      const onDetail = parts.length === 3 && parts[0] === "admin" && parts[1] === "articles" && parts[2] !== "new";
      return onDetail && ((document.getElementById("标题-*") || {}).value || "").includes("冒烟后台文章");
    })()`,
    15000
  );
  const createDebug = created
    ? ""
    : await evaluate(
        flowPage.sessionId,
        `(() => {
          const title = document.getElementById("标题-*");
          const editor = document.querySelector("textarea.w-md-editor-text-input") ||
            document.querySelector("[data-color-mode] textarea");
          return JSON.stringify({
            pathname: location.pathname,
            titleValue: title ? title.value : null,
            contentValue: editor ? editor.value.slice(0, 40) : null,
            alert: (document.querySelector('[role="alert"]') || {}).textContent || null,
            text: document.body.innerText.split("\\n").join(" ").slice(0, 180),
          });
        })()`
      );
  check("后台可创建草稿并跳转详情页", created, createDebug);

  if (created) {
    // 整页重载一次，确保详情页的客户端组件已经水合，避免点击保存时
    // 事件处理器还没挂上（生产构建下比 dev 更容易撞到时序）。
    await send("Page.reload", {}, flowPage.sessionId);
    await waitFor(
      flowPage.sessionId,
      `!!(document.querySelector("textarea.w-md-editor-text-input") || document.querySelector("[data-color-mode] textarea"))`,
      10000
    );
    // 等正文从 API 回填进编辑器再保存；否则会触发“标题和内容不能为空”。
    await waitFor(
      flowPage.sessionId,
      `((document.querySelector("textarea.w-md-editor-text-input") || document.querySelector("[data-color-mode] textarea") || {}).value || "").length > 5`,
      10000
    );
    await fillByLabel(flowPage.sessionId, "标题", updatedTitle);
    await clickByText(flowPage.sessionId, "保存草稿");
    const updated = await waitFor(
      flowPage.sessionId,
      `((document.getElementById("标题-*") || {}).value || "").includes("冒烟后台文章（已更新）")`,
      10000
    );
    const updateDebug = await evaluate(
      flowPage.sessionId,
      `(() => JSON.stringify({
        title: (document.getElementById("标题-*") || {}).value || null,
        alert: (document.querySelector('[role="alert"]') || {}).textContent || null,
        buttons: [...document.querySelectorAll("button")].map((item) => item.textContent?.trim()).slice(0, 12),
      }))()`
    );
    check("后台可修改草稿标题", updated && !/保存失败|错误|失败/.test(updateDebug), updateDebug);

    if (updated) {
      await send("Page.navigate", { url: BASE + "/admin" }, flowPage.sessionId);
      const listed = await waitFor(
        flowPage.sessionId,
        `document.body.innerText.includes("冒烟后台文章（已更新）")`,
        20000
      );
      const listDebug = listed
        ? ""
        : await evaluate(
            flowPage.sessionId,
            `document.body.innerText.split("\\n").join(" ").slice(0, 220)`
          );
      check("后台文章列表可见新建/修改后的草稿", listed, listDebug);

      if (listed) {
        const deleteClicked = await evaluate(
          flowPage.sessionId,
          `(() => {
            window.confirm = () => true;
            const row = [...document.querySelectorAll("tr")].find((item) =>
              (item.textContent || "").includes("冒烟后台文章（已更新）")
            );
            if (!row) return false;
            const button = [...row.querySelectorAll("button")].find((item) =>
              (item.textContent || "").includes("删除")
            );
            if (!button) return false;
            button.click();
            return true;
          })()`
        );
        const deleted = deleteClicked
          ? await waitFor(
              flowPage.sessionId,
              `![...document.querySelectorAll("tr")].some((item) =>
                (item.textContent || "").includes("冒烟后台文章（已更新）")
              )`,
              10000
            )
          : false;
        check("后台可通过列表删除草稿", deleted);
      }
    }
  }
}

await send("Network.clearBrowserCookies", {}, flowPage.sessionId);
await send("Page.navigate", { url: BASE + "/admin" }, flowPage.sessionId);
const adminRedirected = await waitFor(
  flowPage.sessionId,
  `location.pathname === "/admin/login"`,
  10000
);
check("未登录访问 /admin 会跳转登录页", adminRedirected);

// 注册全链路：调试验证码模式下，表单取码、注册、登录态头部同步。
const newUsername = "smoke-new-user";
await send("Page.navigate", { url: BASE + "/register" }, flowPage.sessionId);
await waitFor(flowPage.sessionId, `!!document.querySelector('input[autocomplete="email"]')`);
await fill(flowPage.sessionId, 'input[autocomplete="username"]', newUsername);
await fill(flowPage.sessionId, 'input[autocomplete="name"]', "冒烟新用户");
await fill(flowPage.sessionId, 'input[autocomplete="email"]', "smoke-new-user@example.com");
// 等 React 水合完成：SSR 的按钮可能先存在但事件还没挂上。
await waitFor(
  flowPage.sessionId,
  `(() => {
    const button = [...document.querySelectorAll("button")].find((item) =>
      (item.textContent || "").includes("发送验证码")
    );
    return !!button && !button.disabled;
  })()`,
  10000
);
await clickByText(flowPage.sessionId, "发送验证码");
const codeVisible = await waitFor(
  flowPage.sessionId,
  `/验证码已生成：\\d{6}/.test(document.body.innerText)`,
  10000
);
const debugCode = codeVisible
  ? await evaluate(flowPage.sessionId, `(document.body.innerText.match(/验证码已生成：(\\d{6})/) || [])[1] || ""`)
  : "";
const registerFallbackText = codeVisible
  ? ""
  : await evaluate(flowPage.sessionId, `document.body.innerText.replace(/\\s+/g, " ").slice(0, 160)`);
check("注册页可发送并显示调试验证码", codeVisible && /^\d{6}$/.test(debugCode), debugCode || registerFallbackText);

await fill(flowPage.sessionId, 'input[autocomplete="one-time-code"]', debugCode);
await evaluate(
  flowPage.sessionId,
  `(() => {
    return true;
  })()`);
await fillNewPasswords(flowPage.sessionId, "smoke-new-password");
await click(flowPage.sessionId, 'form button[type="submit"]');
const registered = await waitFor(
  flowPage.sessionId,
  `location.pathname === "/" && document.body.innerText.includes("冒烟新用户")`,
  25000
);
if (registered) {
  check("注册成功后自动登录并同步头部账号", true);
} else {
  // 满载机器上注册提交 + 客户端跳转 + 头部会话同步可能超过 15s；
  // 失败时带上当前位置与页面片段，区分「没跳转」和「头部没同步」。
  const diag = await evaluate(
    flowPage.sessionId,
    `location.pathname + " | " + document.body.innerText.split("\n").join(" ").slice(0, 140)`
  );
  check("注册成功后自动登录并同步头部账号", false, diag);
}

// 忘记密码：发码 → 重置 → 用新密码重新登录。
await send("Network.clearBrowserCookies", {}, flowPage.sessionId);
await send("Page.navigate", { url: BASE + "/forgot-password" }, flowPage.sessionId);
await waitFor(flowPage.sessionId, `!!document.querySelector('input[autocomplete="email"]')`);
await fill(flowPage.sessionId, 'input[autocomplete="email"]', "smoke-user@example.com");
await clickByText(flowPage.sessionId, "发送验证码");
const resetCodeVisible = await waitFor(
  flowPage.sessionId,
  `/验证码为 \\d{6}/.test(document.body.innerText)`,
  10000
);
const resetDebugCode = resetCodeVisible
  ? await evaluate(
      flowPage.sessionId,
      `(document.body.innerText.match(/验证码为 (\\d{6})/) || [])[1] || ""`
    )
  : "";
const resetFallback = resetCodeVisible
  ? ""
  : await evaluate(
      flowPage.sessionId,
      `document.body.innerText.split("\\n").join(" ").slice(0, 180)`
    );
check(
  "忘记密码页可发送并显示调试验证码",
  resetCodeVisible && /^\d{6}$/.test(resetDebugCode),
  resetDebugCode || resetFallback
);

if (resetCodeVisible) {
  await fill(flowPage.sessionId, 'input[autocomplete="one-time-code"]', resetDebugCode);
  await evaluate(
    flowPage.sessionId,
    `(() => {
      return true;
    })()`);
  await fillNewPasswords(flowPage.sessionId, "smoke-reset-password");
  await clickByText(flowPage.sessionId, "重置密码");
  const resetDone = await waitFor(
    flowPage.sessionId,
    `document.body.innerText.includes("密码已重置")`,
    10000
  );
  check("忘记密码可完成重置并提示重新登录", resetDone);
}

await send("Page.navigate", { url: BASE + "/login" }, flowPage.sessionId);
await waitFor(flowPage.sessionId, `!!document.querySelector('input[autocomplete="username"]')`);
await fill(flowPage.sessionId, 'input[autocomplete="username"]', "smoke-user");
await fill(flowPage.sessionId, 'input[autocomplete="current-password"]', "smoke-reset-password");
await click(flowPage.sessionId, 'form button[type="submit"]');
const reloginAfterReset = await waitFor(
  flowPage.sessionId,
  `location.pathname === "/" && document.body.innerText.includes("冒烟用户")`,
  15000
);
check("重置后的新密码可以登录", reloginAfterReset);

await closePage(flowPage);
}

console.log(`\n结果：${failures.length === 0 ? "全部通过" : `${failures.length} 项失败`}`);
for (const f of failures) console.log(`  - ${f}`);
cleanup(failures.length === 0 ? 0 : 1);
