"use client";

import { useEffect } from "react";

function processCodeBlocks() {
  document.querySelectorAll("pre").forEach((pre) => {
    if (pre.querySelector(".copy-btn")) return;
    pre.style.position = "relative";

    const code = pre.querySelector("code");
    if (!code) return;
    const text = code.textContent || "";

    // Line numbers for multi-line code blocks
    if (!pre.querySelector(".line-num") && text.includes("\n")) {
      const lines = text.split("\n");
      // Remove trailing empty line
      if (lines[lines.length - 1] === "") lines.pop();
      if (lines.length > 1) {
        pre.setAttribute("data-lined", "");
        code.innerHTML = lines
          .map((line, i) =>
            `<span class="code-line"><span class="line-num">${i + 1}</span><span class="line-content">${escapeHtml(line) || " "}</span></span>`
          )
          .join("");
      }
    }

    const lang = code.className.match(/language-(\w+)/)?.[1];

    // Language badge — top left
    if (lang && !pre.querySelector(".lang-label")) {
      const icons: Record<string, string> = {
        typescript: "🔷", javascript: "🟨", python: "🐍",
        rust: "🦀", go: "🔵", java: "☕", kotlin: "🟣",
        c: "⚙️", cpp: "⚙️", csharp: "🟪",
        ruby: "💎", php: "🐘", swift: "🟠",
        shell: "💻", bash: "💻", html: "🌐", css: "🎨",
        sql: "🗄️", docker: "🐳", json: "📋", yaml: "📄",
        markdown: "📝", tsx: "🔷", jsx: "🟨",
        nginx: "🟢", env: "⚙️", md: "📝",
      };
      const icon = icons[lang.toLowerCase()] || "";
      const label = document.createElement("span");
      label.className =
        "lang-label absolute top-2 left-2 z-10 flex items-center gap-1 rounded-md bg-purple-500/20 px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-purple-200/80 select-none";
      label.textContent = `${icon} ${lang}`.trim();
      pre.appendChild(label);
    }

    // Copy button — top right
    const btn = document.createElement("button");
    btn.className =
      "copy-btn absolute top-1.5 right-2 z-10 flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[11px] text-white/40 hover:bg-pink-500/30 hover:text-white transition-all";
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span>复制</span>`;
    btn.onclick = async () => {
      const raw = code.textContent || "";
      await navigator.clipboard.writeText(raw);
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>已复制</span>`;
      setTimeout(() => {
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span>复制</span>`;
      }, 2000);
    };
    pre.appendChild(btn);
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function CodeCopyButton() {
  useEffect(() => {
    processCodeBlocks();
    const observer = new MutationObserver(processCodeBlocks);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
