"use client";

import { useState, useRef, useEffect, type SVGProps } from "react";
import { useTheme, type Theme } from "@/lib/theme";
import { MonitorIcon, MoonIcon, SunIcon } from "@/components/public/layout/SiteIcons";

type IconComponent = (props: SVGProps<SVGSVGElement>) => React.ReactElement;

const options: { value: Theme; icon: IconComponent; label: string }[] = [
  { value: "light", icon: SunIcon, label: "明亮" },
  { value: "dark", icon: MoonIcon, label: "黑暗" },
  { value: "system", icon: MonitorIcon, label: "跟随系统" },
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
  const CurrentIcon = current.icon;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="icon-button"
        aria-label="主题切换"
        aria-expanded={open}
        aria-controls="theme-menu"
      >
        <CurrentIcon className="h-5 w-5" />
      </button>
      {open && (
        <div id="theme-menu" role="menu" className="absolute left-1/2 top-full z-50 mt-2 w-36 -translate-x-1/2 rounded-md border border-line bg-surface p-1 shadow-float">
          {options.map((opt) => {
            const OptIcon = opt.icon;
            return (
              <button
                key={opt.value}
                role="menuitemradio"
                aria-checked={theme === opt.value}
                onClick={() => {
                  setTheme(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-sm px-3 py-2 text-meta transition-colors ${
                  theme === opt.value
                    ? "bg-primary-soft font-medium text-primary-deep"
                    : "text-ink-2 hover:bg-surface-hover"
                }`}
              >
                <OptIcon className="h-4 w-4" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
