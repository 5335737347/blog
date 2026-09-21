"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@/components/admin/ui/Alert";
import EmptyState from "@/components/admin/ui/EmptyState";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { readApiData, readApiError } from "@/lib/api-client";

interface Track {
  id: string;
  title: string;
  artist: string | null;
  url: string;
  createdAt: string;
}

/**
 * 音乐管理：从原独立页面整体迁入「资源管理」，交互不变。
 */
export default function MusicManager() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("error");
  const fileRef = useRef<HTMLInputElement>(null);

  // External URL form
  const [extTitle, setExtTitle] = useState("");
  const [extArtist, setExtArtist] = useState("");
  const [extUrl, setExtUrl] = useState("");

  const fetchTracks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/music");
      setTracks(await readApiData<Track[]>(res));
    } catch (reason) {
      setMessageKind("error");
      setMessage(reason instanceof Error ? reason.message : "加载音乐失败");
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // setTimeout(0)：fetch 首个 await 前会同步 setLoading，直接调用会被
    // react-hooks/set-state-in-effect 视为级联渲染；延后一拍规避。
    const id = window.setTimeout(() => {
      void fetchTracks();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchTracks]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name.replace(/\.[^.]+$/, ""));
      const res = await fetch("/api/music", { method: "POST", body: fd });
      if (!res.ok) {
        setMessageKind("error");
        setMessage(await readApiError(res, "上传失败"));
        return;
      }
      setMessageKind("success");
      setMessage("上传成功");
      await fetchTracks();
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setMessageKind("error");
      setMessage("网络错误，上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleAddUrl = async () => {
    if (!extTitle || !extUrl) return;
    setMessage("");
    try {
      const res = await fetch("/api/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: extTitle, artist: extArtist || null, url: extUrl }),
      });
      if (!res.ok) {
        setMessageKind("error");
        setMessage(await readApiError(res, "添加失败"));
        return;
      }
      setMessageKind("success");
      setMessage("添加成功");
      setExtTitle("");
      setExtArtist("");
      setExtUrl("");
      await fetchTracks();
    } catch {
      setMessageKind("error");
      setMessage("网络错误，添加失败");
    }
  };

  const handleDelete = async (track: Track) => {
    if (!confirm(`确定删除「${track.title}」？`)) return;
    setMessage("");
    try {
      const res = await fetch(`/api/music/${track.id}`, { method: "DELETE" });
      if (!res.ok) {
        setMessageKind("error");
        setMessage(await readApiError(res, "删除失败"));
        return;
      }
      setMessageKind("success");
      setMessage("已删除");
      await fetchTracks();
    } catch {
      setMessageKind("error");
      setMessage("网络错误，删除失败");
    }
  };

  return (
    <section aria-labelledby="music-heading">
      <h2 id="music-heading" className="mb-3 text-ui font-semibold text-ink">
        音乐（{tracks.length}）
      </h2>
      <p className="mb-3 text-micro text-ink-3">前台播放器按上传顺序播放这里的曲目。</p>

      {message && <Alert variant={messageKind}>{message}</Alert>}

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        {/* Upload */}
        <form
          onSubmit={handleUpload}
          className="panel flex flex-col gap-3 border-dashed p-5"
        >
          <h3 className="text-ui font-semibold text-ink">上传音乐文件</h3>
          <input
            ref={fileRef}
            type="file"
            accept=".mp3,.wav,.ogg,.webm"
            aria-label="选择要上传的音乐文件"
            className="text-meta text-ink-2 file:mr-3 file:rounded-sm file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-meta file:font-medium file:text-primary-deep"
          />
          <div>
            <Button type="submit" disabled={uploading} size="sm">
              {uploading ? "上传中…" : "上传"}
            </Button>
          </div>
          <p className="text-micro text-ink-3">支持 MP3/WAV/OGG，最大 20MB</p>
        </form>

        {/* External URL */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleAddUrl();
          }}
          className="panel flex flex-col gap-2 p-5"
        >
          <h3 className="mb-1 text-ui font-semibold text-ink">添加外链</h3>
          <Input label="标题" value={extTitle} onChange={(e) => setExtTitle(e.target.value)} />
          <Input
            label="艺术家"
            placeholder="可选"
            value={extArtist}
            onChange={(e) => setExtArtist(e.target.value)}
          />
          <Input
            label="音乐 URL"
            value={extUrl}
            onChange={(e) => setExtUrl(e.target.value)}
          />
          <div className="mt-1">
            <Button type="submit" size="sm" disabled={!extTitle || !extUrl}>
              添加
            </Button>
          </div>
        </form>
      </div>

      {/* Track list */}
      <div>
        {loading ? (
          <p className="text-ink-3">加载中…</p>
        ) : tracks.length === 0 ? (
          <EmptyState message="暂无音乐" />
        ) : (
          <div className="space-y-2">
            {tracks.map((track) => (
              <div key={track.id} className="panel flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-meta font-medium text-ink">{track.title}</p>
                  <p className="truncate text-micro text-ink-3">
                    {track.artist || "—"} · {track.url}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <audio src={track.url} controls className="h-8 w-40" />
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(track)}>
                    <span className="text-danger">删除</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
