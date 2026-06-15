"use client";

import { useEffect } from "react";

export default function CodeCopyButton() {
  useEffect(() => {
    document.querySelectorAll("pre").forEach((pre) => {
      if (pre.querySelector(".copy-btn")) return;
      const btn = document.createElement("button");
      btn.className =
        "copy-btn absolute top-2 right-2 rounded-lg bg-white/10 px-2 py-1 text-xs text-white/60 hover:bg-white/20 hover:text-white transition-colors";
      btn.textContent = "📋";
      btn.onclick = async () => {
        const code = pre.querySelector("code")?.textContent || "";
        await navigator.clipboard.writeText(code);
        btn.textContent = "✅";
        setTimeout(() => (btn.textContent = "📋"), 2000);
      };
      if (!pre.style.position) pre.style.position = "relative";
      pre.appendChild(btn);
    });
  }, []);

  return null;
}
