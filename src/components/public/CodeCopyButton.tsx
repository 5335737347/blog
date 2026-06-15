"use client";

import { useEffect } from "react";

function processCodeBlocks() {
  document.querySelectorAll("pre").forEach((pre) => {
    if (pre.querySelector(".copy-btn")) return;
    pre.style.position = "relative";

    const code = pre.querySelector("code");
    if (!code) return;

    // Check if multi-line — if so, enable CSS line numbers
    const text = code.textContent || "";
    if (text.includes("\n") && text.trim().split("\n").length > 1) {
      pre.setAttribute("data-lined", "");
    }

    const lang = code.className.match(/language-(\w+)/)?.[1];

    // Language badge
    if (lang && !pre.querySelector(".lang-label")) {
      const icons: Record<string, string> = {
        typescript: "🔷", javascript: "🟨", python: "🐍",
        rust: "🦀", go: "🔵", java: "☕", kotlin: "🟣",
        c: "⚙️", cpp: "⚙️", csharp: "🟪",
        ruby: "💎", php: "🐘", swift: "🟠",
        shell: "💻", bash: "💻", html: "🌐", css: "🎨",
        sql: "🗄️", docker: "🐳", json: "📋", yaml: "📄",
        markdown: "📝", tsx: "🔷", jsx: "🟨", nginx: "🟢", env: "⚙️",
      };
      const icon = icons[lang.toLowerCase()] || "";
      const label = document.createElement("span");
      label.className = "lang-label";
      label.textContent = `${icon} ${lang}`.trim();
      pre.appendChild(label);
    }

    // Copy button
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span>复制</span>`;
    btn.onclick = async () => {
      await navigator.clipboard.writeText(code.textContent || "");
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>已复制</span>`;
      setTimeout(() => {
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span>复制</span>`;
      }, 2000);
    };
    pre.appendChild(btn);
  });
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
