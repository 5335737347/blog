"use client";

import { useState, useRef } from "react";
import Button from "@/components/ui/Button";
import Link from "next/link";

interface ImportResult {
  success: boolean;
  title: string;
  slug?: string;
  source?: string;
  error?: string;
}

export default function ImportPage() {
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const fd = new FormData();
    for (let i = 0; i < files.length; i++) {
      fd.append("files", files[i]);
    }

    const res = await fetch("/api/import", { method: "POST", body: fd });
    const data = await res.json();
    setResults(data.results || []);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!fileRef.current) return;
    const dt = new DataTransfer();
    for (const file of e.dataTransfer.files) {
      dt.items.add(file);
    }
    fileRef.current.files = dt.files;
    handleUpload();
  };

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-purple-950 dark:text-purple-50">
        📥 导入笔记
      </h2>

      <p className="mb-4 text-sm text-purple-400 dark:text-purple-500">
        上传 Markdown (.md)、Word (.docx)、HTML (.html) 或纯文本 (.txt)。
        自动识别格式并转换为 Markdown。支持 YAML frontmatter。
        导入后为草稿状态。
      </p>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="mb-6 rounded-2xl border-2 border-dashed border-pink-200 p-12 text-center transition-colors hover:border-purple-300 dark:border-purple-800/50 dark:hover:border-purple-600"
      >
        <div className="text-4xl mb-3">📂</div>
        <p className="mb-4 text-sm text-purple-500 dark:text-purple-400">
          拖拽文件到此处，或点击选择
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.docx,.html,.htm,.txt"
          multiple
          onChange={handleUpload}
          className="hidden"
          id="import-file-input"
        />
        <label
          htmlFor="import-file-input"
          className="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-r from-pink-400 to-purple-400 px-5 py-2 text-sm font-medium text-white shadow-md shadow-pink-200 transition-all duration-200 hover:from-pink-500 hover:to-purple-500 active:scale-95 dark:shadow-purple-900/30"
        >
          {uploading ? "导入中..." : "选择文件"}
        </label>
      </div>

      {results.length > 0 && (
        <div className="rounded-2xl border border-pink-100 bg-white p-4 dark:border-purple-800/30 dark:bg-purple-950/30">
          <h3 className="mb-3 text-sm font-semibold text-purple-900 dark:text-purple-100">
            导入结果
          </h3>
          <div className="space-y-1 text-sm">
            {results.map((r, i) => (
              <div
                key={i}
                className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  r.success
                    ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
                    : "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
                }`}
              >
                <span>
                  {r.success ? "✅" : "❌"} {r.title}
                  {r.source && <span className="ml-1 text-xs opacity-60">(.{r.source})</span>}
                </span>
                <span className="text-xs">
                  {r.success ? (
                    <Link href={`/admin/articles/${r.slug}`} className="underline">
                      编辑
                    </Link>
                  ) : (
                    r.error
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
