"use client";

import { useRef, useState, type HTMLAttributes, type ReactNode } from "react";

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

  const handleCopy = async () => {
    const code = preRef.current?.querySelector("code")?.textContent || "";
    if (!code) return;

    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
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
          aria-label={copied ? "代码已复制" : "复制代码"}
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
          <span>{copied ? "已复制" : "复制"}</span>
        </button>
      </div>
      <pre
        ref={preRef}
        className={["markdown-code-block", className].filter(Boolean).join(" ")}
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}
