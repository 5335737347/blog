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
   */
  const scrolled = await evaluate(readerPage.sessionId, `(() => {
    const sections = document.querySelectorAll('.reading h2');
    const target = sections[1] || sections[0];
    if (!target) return { found: false, sections: sections.length };
    // 让标题落在视口顶部约 120px 处：目录高亮用的 IntersectionObserver
    // 观察带是 -96px 0px -70% 0px，标题若停在 96px 以内会被判为「不在带内」，
    // 高亮就不会更新——这是断言曾经的假失败来源（真实用户滚动时几乎不会正好停在那一小段）。
    const top = target.getBoundingClientRect().top + window.scrollY - 120;
    window.scrollTo(0, Math.max(0, top));
    return { found: true, sections: sections.length, target: target.textContent.trim().slice(0, 20) };
  })()`);
  let activeToc = null;
  for (let i = 0; i < 40; i += 1) {
    activeToc = await evaluate(readerPage.sessionId, `(() => {
      const cur = document.querySelector('nav[aria-label="文章目录"] a[aria-current="location"]');
      return cur ? cur.textContent.trim().slice(0, 30) : null;
    })()`).catch(() => null);
    if (activeToc) break;
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
const drawerState = await evaluate(readerPage.sessionId, `(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-controls') === 'toc-drawer');
  if (!btn) return { found: false };
  btn.click();
  return { found: true };
})()`);
let drawer = { open: false };
for (let i = 0; i < 20; i++) {
  drawer = await evaluate(readerPage.sessionId, `(() => {
    const d = document.getElementById('toc-drawer');
    return d ? { open: true, links: d.querySelectorAll('a').length } : { open: false };
  })()`).catch(() => ({ open: false }));
  if (drawer.open) break;
  await new Promise((r) => setTimeout(r, 250));
}
check("移动端可打开目录抽屉", drawerState.found && drawer.open && drawer.links >= 2, JSON.stringify(drawer));

// 抽屉里的链接应能关闭抽屉并跳转
const drawerNav = await evaluate(readerPage.sessionId, `(() => {
  const a = document.querySelector('#toc-drawer a');
  if (!a) return { clicked: false };
  a.click();
  return { clicked: true, href: a.getAttribute('href') };
})()`);
await new Promise((r) => setTimeout(r, 500));
const drawerClosed = await evaluate(readerPage.sessionId, `!document.getElementById('toc-drawer')`).catch(() => false);
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
}

console.log(`\n结果：${failures.length === 0 ? "全部通过" : `${failures.length} 项失败`}`);
for (const f of failures) console.log(`  - ${f}`);
cleanup(failures.length === 0 ? 0 : 1);
