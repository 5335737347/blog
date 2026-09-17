"use client";

import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";

interface MarkdownCodeBlockProps extends HTMLAttributes<HTMLPreElement> {
  children: ReactNode;
  language?: string;
}

function displayLanguage(language: string | undefined): string {
  if (!language) return "code";
  const aliases: Record<string, string> = {
    js: "JavaScript",
    jsx: "JSX",
    ts: "TypeScript",
    tsx: "TSX",
    py: "Python",
    sh: "Shell",
    bash: "Bash",
    zsh: "Zsh",
    yml: "YAML",
    md: "Markdown",
    dockerfile: "Dockerfile",
  };
  return aliases[language.toLowerCase()] || language;
}

export default function MarkdownCodeBlock({
  children,
  className,
  language,
  ...props
}: MarkdownCodeBlockProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const resetTimer = useRef<number | null>(null);

  // 卸载时清理定时器，避免对已卸载组件调用 setState。
  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    };
  }, []);

  const scheduleReset = () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      setCopied(false);
      setFailed(false);
      resetTimer.current = null;
    }, 1600);
  };

  const handleCopy = async () => {
    const code = preRef.current?.querySelector("code")?.textContent || "";
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // 权限被拒或非安全上下文：给出可见反馈而不是未处理的 Promise 拒绝。
      setFailed(true);
      setCopied(false);
      scheduleReset();
      return;
    }
    setCopied(true);
    setFailed(false);
    scheduleReset();
  };

  return (
    <div
      className="markdown-code-frame"
      data-language={language}
    >
      <div className="markdown-code-header" contentEditable={false}>
        <span className="markdown-code-language">{displayLanguage(language)}</span>
        <button
          type="button"
          className="markdown-copy-button"
          onClick={handleCopy}
          aria-label={failed ? "复制失败" : copied ? "代码已复制" : "复制代码"}
        >
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {copied ? (
              <path d="M20 6 9 17l-5-5" />
            ) : (
              <>
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </>
            )}
          </svg>
          <span aria-live="polite">{failed ? "复制失败" : copied ? "已复制" : "复制"}</span>
        </button>
      </div>
      <pre
        ref={preRef}
        className={["markdown-code-block", className].filter(Boolean).join(" ")}
        // 长代码需要横向滚动，滚动区必须能被键盘聚焦（axe: scrollable-region-focusable）。
        // 这里不再写 aria-label：`pre` 没有可承载名称的角色，该属性会被 AT 忽略
        //（axe aria-prohibited-attr）。可访问名称交给代码块头部已有的语言标签，
        // 它已经是可见文本，屏幕阅读器会先读到它。
        tabIndex={0}
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}
