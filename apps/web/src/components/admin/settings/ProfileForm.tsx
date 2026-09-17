"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ProfileDto, ProfileSocialLink } from "@kpblog/contracts";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import { readApiData, readApiError } from "@/lib/api-client";

const EMPTY: ProfileDto = {
  name: "",
  headline: "",
  bio: "",
  location: "",
  avatar: "",
  email: "",
  now: "",
  socialLinks: [],
};

/**
 * 个人资料编辑。内容服务于 /about、/now 与页脚。
 *
 * 这些字段原先写在 apps/web/src/config/profile.ts 里，改一句简介就要改代码、
 * 重新构建再重启；现在与博客标题一样在后台修改，保存后 60 秒内全站生效。
 */
export default function ProfileForm() {
  const [profile, setProfile] = useState<ProfileDto>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/profile")
      .then((res) => readApiData<ProfileDto>(res))
      .then((data) => {
        if (cancelled) return;
        setProfile({ ...EMPTY, ...data });
        setLoading(false);
      })
      .catch((reason) => {
        if (cancelled) return;
        setMessage(reason instanceof Error ? `❌ ${reason.message}` : "❌ 加载个人资料失败");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = useCallback((changes: Partial<ProfileDto>) => {
    setProfile((current) => ({ ...current, ...changes }));
  }, []);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) {
        setMessage(`❌ ${await readApiError(res, "保存失败")}`);
        return;
      }
      const saved = await readApiData<ProfileDto>(res);
      setProfile({ ...EMPTY, ...saved });
      setMessage("✅ 个人资料已保存");
    } catch {
      setMessage("❌ 网络错误，保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-purple-400 dark:text-purple-500">加载中...</p>;
  }

  return (
    <form onSubmit={handleSave} className="flex max-w-2xl flex-col gap-6">
      {message && (
        <div
          role="status"
          className={`rounded-xl px-4 py-2 text-sm ${
            message.startsWith("✅")
              ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300"
              : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
          }`}
        >
          {message}
        </div>
      )}

      {/* ===== 基本信息 ===== */}
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-sm font-semibold text-purple-900 dark:text-purple-100">
          基本信息
        </legend>
        <Input
          label="昵称"
          value={profile.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="显示在个人介绍页"
        />
        <Input
          label="一句话介绍"
          value={profile.headline}
          onChange={(e) => patch({ headline: e.target.value })}
          placeholder="作为个人介绍页的大标题"
        />
        <Textarea
          label="个人简介"
          rows={5}
          value={profile.bio}
          onChange={(e) => patch({ bio: e.target.value })}
          placeholder="支持换行"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="所在地"
            value={profile.location}
            onChange={(e) => patch({ location: e.target.value })}
          />
          <Input
            label="邮箱"
            type="email"
            value={profile.email}
            onChange={(e) => patch({ email: e.target.value })}
            placeholder="显示在个人介绍页"
          />
        </div>
        <Input
          label="头像地址"
          value={profile.avatar}
          onChange={(e) => patch({ avatar: e.target.value })}
          placeholder="/images/xxx.jpg 或 https://..."
        />
        <Textarea
          label="近况"
          rows={4}
          value={profile.now}
          onChange={(e) => patch({ now: e.target.value })}
          placeholder="显示在「近况」页，支持换行"
        />
      </fieldset>

      {/* ===== 社交链接 ===== */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold text-purple-900 dark:text-purple-100">
          社交链接
        </legend>
        <p className="text-xs text-purple-400 dark:text-purple-500">
          显示在个人介绍页与页脚，最多 12 条。
        </p>
        {profile.socialLinks.map((link, index) => (
          <SocialLinkRow
            key={index}
            link={link}
            onChange={(next) =>
              patch({
                socialLinks: profile.socialLinks.map((item, i) => (i === index ? next : item)),
              })
            }
            onRemove={() =>
              patch({ socialLinks: profile.socialLinks.filter((_, i) => i !== index) })
            }
          />
        ))}
        <div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              patch({ socialLinks: [...profile.socialLinks, { label: "", href: "" }] })
            }
          >
            + 添加链接
          </Button>
        </div>
      </fieldset>

      <div>
        <Button type="submit" disabled={saving}>
          {saving ? "保存中..." : "保存个人资料"}
        </Button>
      </div>
    </form>
  );
}

function SocialLinkRow({
  link,
  onChange,
  onRemove,
}: {
  link: ProfileSocialLink;
  onChange: (next: ProfileSocialLink) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-end gap-2">
      <div className="w-32 shrink-0">
        <Input
          label="名称"
          value={link.label}
          onChange={(e) => onChange({ ...link, label: e.target.value })}
          placeholder="GitHub"
        />
      </div>
      <div className="min-w-0 flex-1">
        <Input
          label="地址"
          value={link.href}
          onChange={(e) => onChange({ ...link, href: e.target.value })}
          placeholder="https://github.com/..."
        />
      </div>
      <Button type="button" size="sm" variant="ghost" onClick={onRemove} aria-label="删除这条链接">
        删除
      </Button>
    </div>
  );
}
