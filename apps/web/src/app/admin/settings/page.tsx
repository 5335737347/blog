"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ProfileForm from "@/components/admin/settings/ProfileForm";
import { readApiData, readApiError } from "@/lib/api-client";

export default function SettingsPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const messageTimer = useRef<number | null>(null);

  // 卸载时清理定时器，避免对已卸载组件调用 setState。
  useEffect(() => {
    return () => {
      if (messageTimer.current !== null) window.clearTimeout(messageTimer.current);
    };
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then((r) => readApiData<Record<string, string>>(r)),
      fetch("/api/auth/key").then((r) => readApiData<{ hasApiKey: boolean; apiKey: null }>(r)),
    ])
      .then(([settings, keyData]) => {
        setTitle(settings.blog_title || "鲲鹏の博客");
        setDescription(settings.blog_description || "");
        setHasApiKey(keyData.hasApiKey);
        setLoading(false);
      })
      .catch((reason) => {
        setMessage(reason instanceof Error ? `❌ ${reason.message}` : "❌ 加载设置失败");
        setLoading(false);
      });
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blog_title: title, blog_description: description }),
      });
      setMessage(res.ok ? "✅ 设置已保存" : `❌ ${await readApiError(res, "保存失败")}`);
    } catch {
      setMessage("❌ 网络错误");
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateKey = async () => {
    setMessage("");
    try {
      const res = await fetch("/api/auth/key", { method: "POST" });
      if (!res.ok) {
        setMessage(`❌ ${await readApiError(res, "API Key 生成失败")}`);
        return;
      }
      const data = await readApiData<{ apiKey: string; hasApiKey: boolean }>(res);
      setApiKey(data.apiKey);
      setHasApiKey(data.hasApiKey);
    } catch {
      setMessage("❌ 网络错误，API Key 生成失败");
    }
  };

  const handleCopyKey = async () => {
    if (apiKey) {
      try {
        await navigator.clipboard.writeText(apiKey);
        setMessage("✅ API Key 已复制");
        if (messageTimer.current !== null) window.clearTimeout(messageTimer.current);
        messageTimer.current = window.setTimeout(() => {
          setMessage("");
          messageTimer.current = null;
        }, 2000);
      } catch {
        setMessage("❌ 无法访问剪贴板，请手动复制 API Key");
      }
    }
  };

  if (loading) {
    return <p className="text-purple-400 dark:text-purple-500">加载中...</p>;
  }

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-purple-950 dark:text-purple-50">
        ⚙️ 博客设置
      </h2>

      <form onSubmit={handleSave} className="max-w-lg flex flex-col gap-4">
        {message && (
          <div
            className={`rounded-xl px-4 py-2 text-sm ${
              message.startsWith("✅")
                ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            }`}
          >
            {message}
          </div>
        )}

        <Input label="博客标题" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input
          label="博客描述"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Button type="submit" disabled={saving}>
          {saving ? "保存中..." : "保存设置"}
        </Button>
      </form>

      {/* Personal profile section */}
      <hr className="my-8 border-pink-100 dark:border-purple-800/30" />
      <div className="max-w-2xl">
        <h3 className="mb-3 text-lg font-semibold text-purple-950 dark:text-purple-50">
          👤 个人资料
        </h3>
        <p className="mb-5 text-sm text-purple-400 dark:text-purple-500">
          用于「个人介绍」「近况」「相册」三个页面与页脚。保存后 60 秒内全站生效。
        </p>
        <ProfileForm />
      </div>

      {/* API Key section */}
      <hr className="my-8 border-pink-100 dark:border-purple-800/30" />
      <div className="max-w-lg">
        <h3 className="mb-3 text-lg font-semibold text-purple-950 dark:text-purple-50">
          🔑 API Key
        </h3>
        <p className="mb-3 text-sm text-purple-400 dark:text-purple-500">
          用于第三方编辑器（Obsidian、Typora 等）通过 API 发布文章
        </p>
        {apiKey ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-xl border-2 border-pink-200 bg-pink-50/50 px-4 py-2.5 text-sm text-purple-700 dark:border-purple-800/50 dark:bg-purple-950/50 dark:text-purple-300">
              {apiKey}
            </code>
            <Button size="sm" variant="secondary" onClick={handleCopyKey}>复制</Button>
            <Button size="sm" variant="ghost" onClick={handleRegenerateKey}>重新生成</Button>
          </div>
        ) : hasApiKey ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-xl border-2 border-pink-200 bg-pink-50/50 px-4 py-2.5 text-sm text-purple-500 dark:border-purple-800/50 dark:bg-purple-950/50 dark:text-purple-400">
              API Key 已生成，仅在重新生成时显示一次
            </div>
            <Button size="sm" variant="ghost" onClick={handleRegenerateKey}>重新生成</Button>
          </div>
        ) : (
          <Button size="sm" onClick={handleRegenerateKey}>生成 API Key</Button>
        )}

        <div className="mt-4 rounded-xl border-2 border-pink-100 bg-pink-50/30 p-4 dark:border-purple-800/30 dark:bg-purple-950/30">
          <p className="mb-2 text-xs font-medium text-purple-600 dark:text-purple-300">用法示例：</p>
          <pre className="overflow-x-auto text-xs text-purple-500 dark:text-purple-400">
{`curl -X POST ${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001"}/api/publish \\
  -H "Authorization: Bearer ${apiKey || "YOUR_KEY"}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"标题","content":"Markdown 内容","tags":["标签1"]}'`}
          </pre>
        </div>
      </div>
    </div>
  );
}
