"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@/components/admin/ui/Alert";
import Button from "@/components/ui/Button";
import type { HomeWallpaperDto } from "@kpblog/contracts";
import { readApiData, readApiError } from "@/lib/api-client";

/**
 * 首页壁纸轮换管理：上传新壁纸（追加到轮换末尾并启用）、启用/停用、
 * 上下移动排序、移出轮换。
 *
 * 「移出轮换」只删登记行，不删文件；仓库自带的默认壁纸移出后可以随时
 * 通过重新上传同路径恢复，但更常见的用法是停用而非删除。
 */
export default function WallpaperManager() {
  const [wallpapers, setWallpapers] = useState<HomeWallpaperDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchWallpapers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wallpapers?all=true");
      setWallpapers(await readApiData<HomeWallpaperDto[]>(res));
    } catch (reason) {
      setMessageKind("error");
      setMessage(reason instanceof Error ? reason.message : "加载壁纸失败");
      setWallpapers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchWallpapers();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchWallpapers]);

  const showNotice = (kind: "success" | "error", text: string) => {
    setMessageKind(kind);
    setMessage(text);
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setMessage("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/wallpapers", { method: "POST", body: fd });
      if (!res.ok) {
        showNotice("error", await readApiError(res, "上传失败"));
        return;
      }
      showNotice("success", "壁纸已上传并加入轮换");
      await fetchWallpapers();
    } catch {
      showNotice("error", "网络错误，上传失败");
    } finally {
      setUploading(false);
    }
  };

  const act = async (
    id: string,
    action: () => Promise<Response>,
    successText: string
  ) => {
    setBusyId(id);
    setMessage("");
    try {
      const res = await action();
      if (!res.ok) {
        showNotice("error", await readApiError(res, "操作失败"));
        return;
      }
      showNotice("success", successText);
      await fetchWallpapers();
    } catch {
      showNotice("error", "网络错误，操作失败");
    } finally {
      setBusyId(null);
    }
  };

  const toggle = (item: HomeWallpaperDto) =>
    act(item.id, () => fetch(`/api/wallpapers/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !item.enabled }),
    }), item.enabled ? "已停用" : "已启用");

  const remove = (item: HomeWallpaperDto) => {
    if (!confirm(`把这张壁纸移出首页轮换？（不删除文件）`)) return;
    return act(item.id, () => fetch(`/api/wallpapers/${item.id}`, { method: "DELETE" }), "已移出轮换");
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= wallpapers.length) return;
    const ids = wallpapers.map((item) => item.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    return act(ids[target] ?? "", () => fetch("/api/wallpapers/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }), "顺序已调整");
  };

  const enabledCount = wallpapers.filter((item) => item.enabled).length;

  return (
    <section aria-labelledby="wallpaper-heading">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 id="wallpaper-heading" className="text-ui font-semibold text-ink">
          首页壁纸（{enabledCount} 张轮换中）
        </h2>
        <input
          ref={fileRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.gif,.avif"
          className="hidden"
          onChange={handleUpload}
        />
        <Button size="sm" variant="secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? "上传中…" : "上传新壁纸"}
        </Button>
      </div>
      <p className="mb-3 text-micro text-ink-3">
        首页每隔几分钟按顺序轮换展示启用的壁纸，改动约 1 分钟内生效。停用不删除文件；「移出轮换」也只是从列表移除。
      </p>

      {message && <Alert variant={messageKind}>{message}</Alert>}

      {loading ? (
        <p className="text-ink-3">加载中…</p>
      ) : wallpapers.length === 0 ? (
        <p className="py-8 text-center text-ink-3">轮换列表为空，首页将回退到内置壁纸。</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {wallpapers.map((item, index) => (
            <li key={item.id} className={`panel overflow-hidden ${item.enabled ? "" : "opacity-60"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.url}
                loading="lazy"
                decoding="async"
                className="aspect-video w-full border-b border-line object-cover"
              />
              <div className="space-y-2 p-3">
                <p className="flex items-center justify-between text-micro">
                  <span className="truncate text-ink-2" title={item.url}>
                    {item.url.replace("/images/", "")}
                  </span>
                  <span className={item.enabled ? "text-success" : "text-ink-4"}>
                    {item.enabled ? "轮换中" : "已停用"}
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={index === 0 || busyId !== null}
                    onClick={() => move(index, -1)}
                    aria-label="上移"
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={index === wallpapers.length - 1 || busyId !== null}
                    onClick={() => move(index, 1)}
                    aria-label="下移"
                  >
                    ↓
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busyId !== null} onClick={() => toggle(item)}>
                    {item.enabled ? "停用" : "启用"}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busyId !== null} onClick={() => remove(item)}>
                    <span className="text-danger">移出</span>
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
