"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@/components/admin/ui/Alert";
import Button from "@/components/ui/Button";
import type { MediaImageDto } from "@kpblog/contracts";
import { readApiData, readApiError } from "@/lib/api-client";
import { CloseIcon } from "@/components/public/layout/SiteIcons";

export type ImageItem = MediaImageDto;

interface ImagePickerModalProps {
  kind: "cover" | "article";
  open: boolean;
  onClose: () => void;
  /** 选中（或上传完成）后回传图片地址。 */
  onPick: (url: string) => void;
}

/**
 * 图库选择弹窗：列出指定类型的已登记图片，可即场上传后自动选中。
 * 供文章封面与编辑器正文插图两处复用。
 */
export default function ImagePickerModal({ kind, open, onClose, onPick }: ImagePickerModalProps) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/images?kind=${kind}`);
      setImages(await readApiData<ImageItem[]>(res));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载图库失败");
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      void fetchImages();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, fetchImages]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch("/api/images", { method: "POST", body: fd });
      if (!res.ok) {
        setError(await readApiError(res, "上传失败"));
        return;
      }
      const image = await readApiData<ImageItem>(res);
      onPick(image.url);
    } catch {
      setError("网络错误，上传失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="选择图片"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} className="panel relative flex max-h-[80vh] w-full max-w-2xl flex-col p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-ui font-semibold text-ink">
            选择图片 <span className="text-ink-3">{kind === "cover" ? "· 封面" : "· 文章图片"}</span>
          </h3>
          <div className="flex items-center gap-2">
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="关闭图片选择"
              className="icon-button"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.gif,.avif"
              className="hidden"
              onChange={handleUpload}
            />
            <Button size="sm" variant="secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? "上传中…" : "上传新图片"}
            </Button>
          </div>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="py-10 text-center text-ink-3">加载中…</p>
          ) : images.length === 0 ? (
            <p className="py-10 text-center text-ink-3">
              图库为空。可以上传本地图片，或在「资源管理」页登记外部图床地址。
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((image) => (
                <li key={image.id}>
                  <button
                    type="button"
                    onClick={() => onPick(image.url)}
                    className="block w-full overflow-hidden rounded-sm border border-line bg-surface text-left transition-colors hover:border-primary"
                    title={image.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt={image.name}
                      loading="lazy"
                      decoding="async"
                      className="aspect-video w-full border-b border-line object-cover"
                    />
                    <span className="block truncate p-2 text-micro text-ink-2">{image.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 flex justify-end border-t border-line pt-3">
          <Button size="sm" variant="ghost" onClick={onClose}>
            取消
          </Button>
        </div>
      </div>
    </div>
  );
}
