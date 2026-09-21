"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import Alert from "@/components/admin/ui/Alert";
import { readApiData, readApiError } from "@/lib/api-client";

interface ImportResult {
  success: boolean;
  title: string;
  id?: string;
  slug?: string;
  source?: string;
  error?: string;
}

export default function ImportPage() {
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError("");
    const fd = new FormData();
    for (let i = 0; i < files.length; i++) {
      fd.append("files", files[i]);
    }

    try {
      const res = await fetch("/api/import", { method: "POST", body: fd });
      if (!res.ok) {
        setError(await readApiError(res, `导入失败: ${res.status}`));
        return;
      }
      const data = await readApiData<{ results: ImportResult[] }>(res);
      setResults(data.results || []);
    } catch {
      setError("网络错误，导入失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
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
      <AdminPageHeader title="导入笔记" />

      <Alert variant="info" className="leading-relaxed">
        上传 Markdown (.md)、Word (.docx)、HTML (.html) 或纯文本 (.txt)。Word (.docx)
        自动转 Markdown。支持 YAML frontmatter：title、slug、tags、excerpt、category、coverImage、published。
        默认导入为草稿，设置 published: true 时会直接发布。
      </Alert>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="panel mb-6 flex flex-col items-center border-dashed p-10 text-center"
      >
        <p className="mb-4 text-meta text-ink-3">拖拽文件到此处，或点击选择</p>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.docx,.html,.htm,.txt"
          multiple
          onChange={handleUpload}
          disabled={uploading}
          className="hidden"
          id="import-file-input"
        />
        <label
          htmlFor="import-file-input"
          className="btn btn-primary cursor-pointer text-meta"
        >
          {uploading ? "导入中…" : "选择文件"}
        </label>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {results.length > 0 && (
        <div className="panel p-4">
          <h3 className="mb-3 text-ui font-semibold text-ink">导入结果</h3>
          <div className="space-y-1 text-meta">
            {results.map((r, i) => (
              <div
                key={i}
                className={`flex items-center justify-between rounded-sm px-3 py-2 ${
                  r.success ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                }`}
              >
                <span className="min-w-0 truncate">
                  {r.title}
                  {r.source && <span className="ml-1 opacity-60">(.{r.source})</span>}
                </span>
                <span className="shrink-0 pl-3 text-micro">
                  {r.success && r.id ? (
                    <Link href={`/admin/articles/${r.id}`} className="underline">
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
