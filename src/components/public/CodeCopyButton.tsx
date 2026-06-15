"use client";

import { useEffect } from "react";

function addButtons() {
  document.querySelectorAll("pre").forEach((pre) => {
    if (pre.querySelector(".copy-btn")) return;
    pre.style.position = "relative";
    pre.style.paddingTop = "2.2rem";

    // Language label
    const code = pre.querySelector("code");
    if (code) {
      const cls = code.className.match(/language-(\w+)/)?.[1];
      if (cls && !pre.querySelector(".lang-label")) {
        const label = document.createElement("span");
        label.className =
          "lang-label absolute top-2.5 left-3 rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-white/50 select-none pointer-events-none";
        label.textContent = cls;
        pre.appendChild(label);
      }
    }

    // Copy button
    const btn = document.createElement("button");
    btn.className =
      "copy-btn absolute top-1.5 right-1.5 flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] text-white/50 hover:bg-pink-500/30 hover:text-white transition-all";
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span>复制</span>`;
    btn.onclick = async () => {
      const text = code?.textContent || "";
      await navigator.clipboard.writeText(text);
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>已复制</span>`;
      setTimeout(() => {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span>复制</span>`;
      }, 2000);
    };
    pre.appendChild(btn);
  });
}

export default function CodeCopyButton() {
  useEffect(() => {
    addButtons();
    const observer = new MutationObserver(addButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
