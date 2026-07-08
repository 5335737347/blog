"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Button from "@/components/ui/Button";
import { readApiData } from "@/lib/api-client";

interface ImageItem {
  name: string;
  url: string;
  size: number;
  modified: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImagesAdminPage() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchImages = useCallback(async () => {
    const res = await fetch("/api/images");
    if (res.ok) {
      setImages(await readApiData<ImageItem[]>(res));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchImages();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchImages]);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (res.ok) {
      fetchImages();
      if (fileRef.current) fileRef.current.value = "";
    }
    setUploading(false);
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(`删除 ${filename}？`)) return;
    await fetch(`/api/images?file=${encodeURIComponent(filename)}`, { method: "DELETE" });
    fetchImages();
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(url);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  if (loading) return <p className="text-purple-400">加载中...</p>;

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-purple-950 dark:text-purple-50">
        🖼️ 图片管理
      </h2>

      {/* Upload */}
      <div className="mb-8 flex items-center gap-4 rounded-2xl border-2 border-dashed border-pink-200 p-4 dark:border-purple-800/50">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="text-sm text-purple-600"
        />
        <Button size="sm" onClick={handleUpload} disabled={uploading}>
          {uploading ? "上传中..." : "上传"}
        </Button>
        <p className="text-xs text-purple-300 dark:text-purple-600">
          JPEG/PNG/WebP/GIF, max 5MB
        </p>
      </div>

      {/* Grid */}
      {images.length === 0 ? (
        <p className="py-20 text-center text-purple-300 dark:text-purple-600">暂无图片</p>
      ) : (
        <div className="grid grid-cols-3 gap-4 md:grid-cols-4 lg:grid-cols-5">
          {images.map((img) => (
            <div
              key={img.name}
              className="group relative overflow-hidden rounded-2xl border-2 border-pink-100 bg-white dark:border-purple-800/30 dark:bg-purple-950/30"
            >
              <img
                src={img.url}
                alt={img.name}
                className="h-40 w-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => handleCopy(img.url)}
                  className="rounded-lg bg-white px-3 py-1 text-xs font-medium text-purple-700 hover:bg-pink-50"
                >
                  {copied === img.url ? "✅ 已复制" : "📋 复制 URL"}
                </button>
                <button
                  onClick={() => handleDelete(img.name)}
                  className="rounded-lg bg-red-500 px-3 py-1 text-xs text-white hover:bg-red-600"
                >
                  删除
                </button>
              </div>
              <div className="p-2">
                <p className="truncate text-xs text-purple-600 dark:text-purple-400" title={img.name}>
                  {img.name}
                </p>
                <p className="text-xs text-purple-300 dark:text-purple-600">{formatSize(img.size)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
