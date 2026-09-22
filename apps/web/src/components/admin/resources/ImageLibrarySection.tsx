"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@/components/admin/ui/Alert";
import EmptyState from "@/components/admin/ui/EmptyState";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { readApiData, readApiError } from "@/lib/api-client";
import type { ImageItem } from "./ImagePickerModal";

interface ImageLibrarySectionProps {
  kind: "cover" | "article";
  title: string;
  description: string;
  emptyText: string;
}

/**
 * 资源页的单一图片板块（封面 / 文章图片共用一份实现）。
 * 覆盖本地文件与外部图床地址的统一列表：上传、登记外链、复制地址、删除。
 * 删除被文章引用的图片时后端 409，同一条目再点一次删除即强制执行。
 */
export default function ImageLibrarySection({
  kind,
  title,
  description,
  emptyText,
}: ImageLibrarySectionProps) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("error");
  const fileRef = useRef<HTMLInputElement>(null);
  const [externalUrl, setExternalUrl] = useState("");
  const [registering, setRegistering] = useState(false);
  /** 409 后进入「武装」状态的图片 id：再次点击删除才带 force。 */
  const [forceArmedId, setForceArmedId] = useState<string | null>(null);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/images?kind=${kind}`);
      setImages(await readApiData<ImageItem[]>(res));
    } catch (reason) {
      setMessageKind("error");
      setMessage(reason instanceof Error ? reason.message : "加载图库失败");
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchImages();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchImages]);

  const showNotice = (nextKind: "success" | "error", text: string) => {
    setMessageKind(nextKind);
    setMessage(text);
  };

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch("/api/images", { method: "POST", body: fd });
      if (!res.ok) {
        showNotice("error", await readApiError(res, "上传失败"));
        return;
      }
      showNotice("success", "上传成功");
      if (fileRef.current) fileRef.current.value = "";
      await fetchImages();
    } catch {
      showNotice("error", "网络错误，上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleRegisterUrl = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!externalUrl.trim()) return;
    setRegistering(true);
    setMessage("");
    try {
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: externalUrl.trim(), kind }),
      });
      if (!res.ok) {
        showNotice("error", await readApiError(res, "登记失败"));
        return;
      }
      showNotice("success", "已登记外部图片地址");
      setExternalUrl("");
      await fetchImages();
    } catch {
      showNotice("error", "网络错误，登记失败");
    } finally {
      setRegistering(false);
    }
  };

  const handleCopy = async (image: ImageItem) => {
    const absolute = image.url.startsWith("/")
      ? `${window.location.origin}${image.url}`
      : image.url;
    try {
      await navigator.clipboard.writeText(absolute);
      showNotice("success", "地址已复制");
    } catch {
      showNotice("success", `请手动复制：${absolute}`);
    }
  };

  const handleDelete = async (image: ImageItem) => {
    const force = forceArmedId === image.id;
    if (!force && !confirm(`确定删除图片「${image.name}」？`)) return;
    setMessage("");
    try {
      const res = await fetch(
        `/api/images/${encodeURIComponent(image.id)}${force ? "?force=true" : ""}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const text = await readApiError(res, "删除失败");
        // 409（仍被引用）时武装该条目：下一次点击带 force 强制删除。
        setForceArmedId(res.status === 409 ? image.id : null);
        showNotice("error", res.status === 409 ? `${text}，再次点击「删除」可强制删除` : text);
        return;
      }
      setForceArmedId(null);
      showNotice("success", "已删除");
      await fetchImages();
    } catch {
      showNotice("error", "网络错误，删除失败");
    }
  };

  return (
    <section aria-labelledby={`${kind}-images-heading`}>
      <h2 id={`${kind}-images-heading`} className="mb-1 text-ui font-semibold text-ink">
        {title}（{images.length}）
      </h2>
      <p className="mb-3 text-micro text-ink-3">{description}</p>

      {message && <Alert variant={messageKind}>{message}</Alert>}

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <form onSubmit={handleUpload} className="panel flex flex-col justify-between gap-3 border-dashed p-4">
          <div>
            <p className="text-meta font-medium text-ink">上传本地文件</p>
            <p className="text-micro text-ink-3">JPG/PNG/WebP/GIF/AVIF，最大 10MB</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
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

        <form onSubmit={handleRegisterUrl} className="panel flex flex-col justify-between gap-3 p-4">
          <div>
            <p className="text-meta font-medium text-ink">登记外部图片地址</p>
            <p className="text-micro text-ink-3">
              不下载文件，只把外部图床（GitHub 等）的 http(s) 地址收进图库统一管理
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input
                aria-label="外部图片地址"
                placeholder="https://…"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" disabled={registering || !externalUrl.trim()}>
              {registering ? "登记中…" : "登记"}
            </Button>
          </div>
        </form>
      </div>

      {loading ? (
        <p className="text-ink-3">加载中…</p>
      ) : images.length === 0 ? (
        <EmptyState message={emptyText} />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image) => {
            const armed = forceArmedId === image.id;
            return (
              <li key={image.id} className="panel overflow-hidden">
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
                  {!image.url.startsWith("/") && (
                    <p className="text-micro text-ink-4">外部链接</p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <Button size="sm" variant="ghost" onClick={() => handleCopy(image)}>
                      复制地址
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={armed ? "ring-1 ring-danger" : ""}
                      onClick={() => handleDelete(image)}
                    >
                      <span className="text-danger">{armed ? "强制删除" : "删除"}</span>
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
