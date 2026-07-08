"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

export default function MusicAdminPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // External URL form
  const [extTitle, setExtTitle] = useState("");
  const [extArtist, setExtArtist] = useState("");
  const [extUrl, setExtUrl] = useState("");

  const fetchTracks = useCallback(async () => {
    const res = await fetch("/api/music");
    setTracks(await readApiData<Track[]>(res));
    setLoading(false);
  }, []);

  useEffect(() => {
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
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", file.name.replace(/\.[^.]+$/, ""));
    const res = await fetch("/api/music", { method: "POST", body: fd });
    if (res.ok) {
      setMessage("✅ 上传成功");
      fetchTracks();
      if (fileRef.current) fileRef.current.value = "";
    } else {
      const error = await readApiError(res, "上传失败");
      setMessage("❌ " + error);
    }
    setUploading(false);
  };

  const handleAddUrl = async () => {
    if (!extTitle || !extUrl) return;
    const res = await fetch("/api/music", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: extTitle, artist: extArtist || null, url: extUrl }),
    });
    if (res.ok) {
      setMessage("✅ 添加成功");
      setExtTitle(""); setExtArtist(""); setExtUrl("");
      fetchTracks();
    } else {
      const error = await readApiError(res, "添加失败");
      setMessage("❌ " + error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("删除这条音乐？")) return;
    await fetch(`/api/music/${id}`, { method: "DELETE" });
    fetchTracks();
  };

  if (loading) return <p className="text-purple-400">加载中...</p>;

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-purple-950 dark:text-purple-50">
        🎵 音乐管理
      </h2>
      {message && (
        <div className="mb-4 rounded-xl bg-pink-50 px-4 py-2 text-sm text-purple-600 dark:bg-purple-900/20 dark:text-purple-300">
          {message}
        </div>
      )}

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        {/* Upload */}
        <div className="rounded-2xl border-2 border-dashed border-pink-200 p-6 dark:border-purple-800/50">
          <h3 className="mb-3 font-semibold text-purple-900 dark:text-purple-100">📤 上传音乐文件</h3>
          <form onSubmit={handleUpload} className="flex flex-col gap-3">
            <input ref={fileRef} type="file" accept=".mp3,.wav,.ogg,.webm" className="text-sm text-purple-600" />
            <Button type="submit" disabled={uploading} size="sm">
              {uploading ? "上传中..." : "上传"}
            </Button>
            <p className="text-xs text-purple-300 dark:text-purple-600">支持 MP3/WAV/OGG，最大 20MB</p>
          </form>
        </div>

        {/* External URL */}
        <div className="rounded-2xl border-2 border-pink-200 p-6 dark:border-purple-800/50">
          <h3 className="mb-3 font-semibold text-purple-900 dark:text-purple-100">🔗 添加外链</h3>
          <div className="flex flex-col gap-2">
            <Input placeholder="标题" value={extTitle} onChange={(e) => setExtTitle(e.target.value)} />
            <Input placeholder="艺术家 (可选)" value={extArtist} onChange={(e) => setExtArtist(e.target.value)} />
            <Input placeholder="音乐 URL" value={extUrl} onChange={(e) => setExtUrl(e.target.value)} />
            <Button size="sm" onClick={handleAddUrl}>添加</Button>
          </div>
        </div>
      </div>

      {/* Track list */}
      <div>
        <h3 className="mb-3 font-semibold text-purple-900 dark:text-purple-100">
          音楽リスト ({tracks.length})
        </h3>
        {tracks.length === 0 ? (
          <p className="text-purple-300 dark:text-purple-600">暂无音乐</p>
        ) : (
          <div className="space-y-2">
            {tracks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-pink-100 bg-white px-4 py-3 dark:border-purple-800/30 dark:bg-purple-950/30"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-purple-900 dark:text-purple-100">{t.title}</p>
                  <p className="truncate text-xs text-purple-400">{t.artist || "—"} · {t.url}</p>
                </div>
                <div className="flex items-center gap-2">
                  <audio src={t.url} controls className="h-8 w-40" />
                  <button onClick={() => handleDelete(t.id)} className="shrink-0 text-xs text-red-400 hover:text-red-600">删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
