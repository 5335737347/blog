"use client";

import { useState, useRef, useEffect } from "react";
import { useEffectType } from "./FallingEffects";

const options: { value: "sakura" | "stars" | "snow" | "none"; icon: string; label: string }[] = [
  { value: "sakura", icon: "🌸", label: "樱花" },
  { value: "stars", icon: "⭐", label: "星星" },
  { value: "snow", icon: "❄️", label: "雪花" },
  { value: "none", icon: "🚫", label: "关闭" },
];

export default function EffectsToggle() {
  const [effect, setEffect] = useEffectType();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = options.find((o) => o.value === effect) || options[3];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`rounded-full p-2 transition-all hover:scale-110 active:scale-90 ${
          effect !== "none"
            ? "text-pink-500 bg-pink-50 dark:text-pink-300 dark:bg-purple-800/50"
            : "text-pink-400 hover:bg-pink-50 dark:text-purple-300 dark:hover:bg-purple-800/50"
        }`}
        aria-label="特效切换"
      >
        <span className="text-base">{current.icon}</span>
      </button>
      {open && (
        <div className="absolute left-1/2 top-full mt-2 w-28 -translate-x-1/2 rounded-2xl border-2 border-pink-200 bg-white p-1.5 shadow-lg shadow-pink-100/50 dark:border-purple-800/50 dark:bg-purple-950 dark:shadow-purple-900/30 z-50">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setEffect(opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all ${
                effect === opt.value
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
