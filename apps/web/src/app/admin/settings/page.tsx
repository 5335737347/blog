"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import Alert from "@/components/admin/ui/Alert";
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
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");
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
        setMessageKind("error");
        setMessage(reason instanceof Error ? reason.message : "加载设置失败");
        setLoading(false);
      });
  }, []);

  const showNotice = (kind: "success" | "error", text: string) => {
    setMessageKind(kind);
    setMessage(text);
  };

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
      if (res.ok) {
        showNotice("success", "设置已保存");
      } else {
        showNotice("error", await readApiError(res, "保存失败"));
      }
    } catch {
      showNotice("error", "网络错误，保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateKey = async () => {
    setMessage("");
    try {
      const res = await fetch("/api/auth/key", { method: "POST" });
      if (!res.ok) {
        showNotice("error", await readApiError(res, "API Key 生成失败"));
        return;
      }
      const data = await readApiData<{ apiKey: string; hasApiKey: boolean }>(res);
      setApiKey(data.apiKey);
      setHasApiKey(data.hasApiKey);
    } catch {
      showNotice("error", "网络错误，API Key 生成失败");
    }
  };

  const handleCopyKey = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      showNotice("success", "API Key 已复制");
      if (messageTimer.current !== null) window.clearTimeout(messageTimer.current);
      messageTimer.current = window.setTimeout(() => {
        setMessage("");
        messageTimer.current = null;
      }, 2000);
    } catch {
      showNotice("error", "无法访问剪贴板，请手动复制 API Key");
    }
  };

  if (loading) {
    return <p className="text-ink-3">加载中…</p>;
  }

  return (
    <div>
      <AdminPageHeader
        title="博客设置"
        description="站点信息、个人资料与发布密钥。"
      />

      {message && <Alert variant={messageKind}>{message}</Alert>}

      <form onSubmit={handleSave} className="panel max-w-2xl p-5">
        <h3 className="mb-4 text-ui font-semibold text-ink">站点信息</h3>
        <div className="flex flex-col gap-4">
          <Input label="博客标题" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input
            label="博客描述"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div>
            <Button type="submit" disabled={saving}>
              {saving ? "保存中…" : "保存设置"}
            </Button>
          </div>
        </div>
      </form>

      <div className="panel mt-6 max-w-2xl p-5">
        <h3 className="text-ui font-semibold text-ink">个人资料</h3>
        <p className="mb-4 mt-1 text-meta text-ink-3">
          用于「个人介绍」「近况」两个页面。保存后 60 秒内全站生效。
        </p>
        <ProfileForm />
      </div>

      <div className="panel mt-6 max-w-2xl p-5">
        <h3 className="text-ui font-semibold text-ink">发布密钥（API Key）</h3>
        <p className="mb-4 mt-1 text-meta text-ink-3">
          用于第三方编辑器（Obsidian、Typora 等）通过 API 发布文章。
        </p>
        {apiKey ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-sm border border-line bg-bg-subtle px-3 py-2 text-meta text-ink">
              {apiKey}
            </code>
            <Button size="sm" variant="secondary" onClick={handleCopyKey}>
              复制
            </Button>
            <Button size="sm" variant="ghost" onClick={handleRegenerateKey}>
              重新生成
            </Button>
          </div>
        ) : hasApiKey ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 rounded-sm border border-line bg-bg-subtle px-3 py-2 text-meta text-ink-3">
              密钥已生成，仅在重新生成时显示一次
            </p>
            <Button size="sm" variant="ghost" onClick={handleRegenerateKey}>
              重新生成
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={handleRegenerateKey}>
            生成 API Key
          </Button>
        )}

        <div className="mt-4 rounded-sm border border-line bg-bg-subtle p-4">
          <p className="mb-2 text-micro font-medium text-ink-2">用法示例：</p>
          <pre className="overflow-x-auto text-micro text-ink-3">
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
