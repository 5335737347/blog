"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@/components/admin/ui/Alert";
import EmptyState from "@/components/admin/ui/EmptyState";
import Button from "@/components/ui/Button";
import { readApiData, readApiError } from "@/lib/api-client";

interface ImageInfo {
  name: string;
  url: string;
  size: number;
  modified: string;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * 封面图库管理：纯文件系统资源，列表/上传/删除 + 复制地址。
 * 复制出的 /images/<name> 粘到文章的「封面图 URL」即可引用。
 */
export default function CoverImageManager() {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("error");
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/images");
      setImages(await readApiData<ImageInfo[]>(res));
    } catch (reason) {
      setMessageKind("error");
      setMessage(reason instanceof Error ? reason.message : "加载图库失败");
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 与音乐页同理：延后一拍，规避 react-hooks/set-state-in-effect 的同步级联。
    const id = window.setTimeout(() => {
      void fetchImages();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchImages]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/images", { method: "POST", body: fd });
      if (!res.ok) {
        setMessageKind("error");
        setMessage(await readApiError(res, "上传失败"));
        return;
      }
      setMessageKind("success");
      setMessage("上传成功");
      if (fileRef.current) fileRef.current.value = "";
      await fetchImages();
    } catch {
      setMessageKind("error");
      setMessage("网络错误，上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleCopy = async (image: ImageInfo) => {
    const absolute = `${window.location.origin}${image.url}`;
    try {
      await navigator.clipboard.writeText(absolute);
      setMessageKind("success");
      setMessage(`已复制 ${image.name} 的地址，可粘贴到文章「封面图 URL」`);
    } catch {
      // 无剪贴板权限（如无头环境）时退化为显示完整地址让用户手动复制。
      setMessageKind("success");
      setMessage(`请手动复制：${absolute}`);
    }
  };

  const handleDelete = async (image: ImageInfo) => {
    if (!confirm(`确定删除图片「${image.name}」？引用它的文章封面会失效。`)) return;
    setMessage("");
    try {
      const res = await fetch(`/api/images/${encodeURIComponent(image.name)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setMessageKind("error");
        setMessage(await readApiError(res, "删除失败"));
        return;
      }
      setMessageKind("success");
      setMessage("已删除");
      await fetchImages();
    } catch {
      setMessageKind("error");
      setMessage("网络错误，删除失败");
    }
  };

  return (
    <section aria-labelledby="cover-images-heading">
      <h2 id="cover-images-heading" className="mb-3 text-ui font-semibold text-ink">
        封面图片（{images.length}）
      </h2>

      {message && <Alert variant={messageKind}>{message}</Alert>}

      <form
        onSubmit={handleUpload}
        className="panel mb-5 flex flex-col gap-3 border-dashed p-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-meta font-medium text-ink">上传新图片</p>
          <p className="text-micro text-ink-3">JPG/PNG/WebP/GIF/AVIF，最大 10MB</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.gif,.avif"
            aria-label="选择要上传的图片"
            className="text-meta text-ink-2 file:mr-3 file:rounded-sm file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-meta file:font-medium file:text-primary-deep"
          />
          <Button type="submit" disabled={uploading} size="sm">
            {uploading ? "上传中…" : "上传"}
          </Button>
        </div>
      </form>

      {loading ? (
        <p className="text-ink-3">加载中…</p>
      ) : images.length === 0 ? (
        <EmptyState message="图库为空，上传第一张封面图吧" />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => (
            <li key={image.name} className="panel overflow-hidden">
              {/* 本地图库文件名由服务端生成，无 Next 图片优化需求 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.name}
                loading="lazy"
                decoding="async"
                className="aspect-video w-full border-b border-line object-cover"
              />
              <div className="space-y-2 p-3">
                <p className="truncate text-micro font-medium text-ink" title={image.name}>
                  {image.name}
                </p>
                <p className="text-micro text-ink-3">{formatSize(image.size)}</p>
                <div className="flex items-center justify-between gap-2">
                  <Button size="sm" variant="ghost" onClick={() => handleCopy(image)}>
                    复制地址
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(image)}>
                    <span className="text-danger">删除</span>
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
