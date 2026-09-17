"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolved: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem("theme");
    return stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : "system";
  } catch {
    // 存储不可用（隐私模式 / 被禁用）时退回跟随系统，不影响页面渲染。
    return "system";
  }
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function subscribeSystemTheme(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getServerSystemTheme(): "light" | "dark" {
  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);
  const systemTheme = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemTheme,
    getServerSystemTheme
  );
  const resolved = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    const id = window.setTimeout(() => {
      setThemeState(getStoredTheme());
      setMounted(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [mounted, resolved]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      if (t === "system") {
        localStorage.removeItem("theme");
      } else {
        localStorage.setItem("theme", t);
      }
    } catch {
      // 无法持久化时主题仍然在本次会话内生效。
    }
  }, []);

  // 记忆化 context value，避免每次渲染都让所有消费组件失效。
  const value = useMemo(
    () => ({ theme, setTheme, resolved }),
    [theme, setTheme, resolved]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
