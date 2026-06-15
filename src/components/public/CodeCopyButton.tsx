"use client";

import { useEffect } from "react";

function addButtons() {
  document.querySelectorAll("pre").forEach((pre) => {
    if (pre.querySelector(".copy-btn")) return;
    pre.style.position = "relative";

    // Language label
    const code = pre.querySelector("code");
    if (code) {
      const cls = code.className.match(/language-(\w+)/)?.[1];
      if (cls && !pre.querySelector(".lang-label")) {
        const label = document.createElement("span");
        label.className =
          "lang-label absolute top-2 left-3 rounded-md bg-white/10 px-2 py-0.5 text-[10px] uppercase text-white/40 font-mono";
        label.textContent = cls;
        pre.appendChild(label);
      }
    }

    // Copy button
    const btn = document.createElement("button");
    btn.className =
      "copy-btn absolute top-2 right-2 rounded-lg bg-white/10 px-2 py-1 text-xs text-white/60 hover:bg-white/20 hover:text-white transition-colors";
    btn.textContent = "📋";
    btn.onclick = async () => {
      const text = code?.textContent || "";
      await navigator.clipboard.writeText(text);
      btn.textContent = "✅";
      setTimeout(() => (btn.textContent = "📋"), 2000);
    };
    pre.appendChild(btn);
  });
}

export default function CodeCopyButton() {
  useEffect(() => {
    addButtons();
    // Also observe for dynamic content changes
    const observer = new MutationObserver(addButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
