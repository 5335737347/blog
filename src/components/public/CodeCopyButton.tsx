"use client";

import { useEffect } from "react";

function addButtons() {
  document.querySelectorAll("pre").forEach((pre) => {
    if (pre.querySelector(".copy-btn")) return;
    pre.style.position = "relative";
    pre.style.paddingTop = "2rem";

    const code = pre.querySelector("code");
    const lang = code?.className.match(/language-(\w+)/)?.[1];

    // Language badge — top left
    if (lang && !pre.querySelector(".lang-label")) {
      const label = document.createElement("span");
      label.className =
        "lang-label absolute top-2 left-2 z-10 flex items-center gap-1 rounded-md bg-purple-500/20 px-2 py-0.5 text-[10px] font-medium text-purple-200 select-none";
      label.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>${lang}`;
      pre.appendChild(label);
    }

    // Copy button — top right
    const btn = document.createElement("button");
    btn.className =
      "copy-btn absolute top-1.5 right-2 z-10 flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[11px] text-white/40 hover:bg-pink-500/30 hover:text-white transition-all";
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg><span>复制</span>`;
    btn.onclick = async () => {
      const text = code?.textContent || "";
      await navigator.clipboard.writeText(text);
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
    addButtons();
    const observer = new MutationObserver(addButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
