"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme, type Theme } from "@/lib/theme";

const options: { value: Theme; icon: string; label: string }[] = [
  { value: "light", icon: "☀️", label: "明亮" },
  { value: "dark", icon: "🌙", label: "黑暗" },
  { value: "system", icon: "💻", label: "跟随系统" },
];

export default function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", handler);
    };
  }, []);

  const current = options.find((o) => o.value === theme) || options[2];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-full p-2 text-pink-400 hover:bg-pink-50 dark:text-purple-300 dark:hover:bg-purple-800/50 transition-all hover:scale-110 active:scale-90"
        aria-label="主题切换"
        aria-expanded={open}
        aria-controls="theme-menu"
      >
        <span className="text-base">{current.icon}</span>
      </button>
      {open && (
        <div id="theme-menu" role="menu" className="absolute left-1/2 top-full mt-2 w-36 -translate-x-1/2 rounded-2xl border-2 border-pink-200 bg-white p-1.5 shadow-lg shadow-pink-100/50 dark:border-purple-800/50 dark:bg-purple-950 dark:shadow-purple-900/30 z-50">
          {options.map((opt) => (
            <button
              key={opt.value}
              role="menuitemradio"
              aria-checked={theme === opt.value}
              onClick={() => {
                setTheme(opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all ${
                theme === opt.value
                  ? "bg-pink-50 text-pink-600 font-medium dark:bg-purple-900/40 dark:text-purple-200"
                  : "text-purple-600 hover:bg-pink-50 dark:text-purple-400 dark:hover:bg-purple-900/20"
              }`}
            >
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
