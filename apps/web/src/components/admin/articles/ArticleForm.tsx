"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import ImagePickerModal from "@/components/admin/resources/ImagePickerModal";
import ArticleEditor from "./ArticleEditor";
import { slugify } from "@/lib/utils";
import { readApiData, readApiError } from "@/lib/api-client";

interface Tag {
  id: string;
  name: string;
  slug: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Project {
  id: string;
  name: string;
  postCount: number;
}

interface ArticleFormData {
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string;
  content: string;
  published: boolean;
  publishedAt: string | null;
  categoryId: string;
  projectId: string;
  tagIds: string[];
}

interface ArticleFormProps {
  initialData?: ArticleFormData;
  isEditing?: boolean;
  articleId?: string;
}

/** 把 ISO 时间串转成 <input type="datetime-local"> 需要的本地格式。 */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function ArticleForm({
  initialData,
  isEditing,
  articleId,
}: ArticleFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialData?.title || "");
  const [slug, setSlug] = useState(initialData?.slug || "");
  const [excerpt, setExcerpt] = useState(initialData?.excerpt || "");
  const [coverImage, setCoverImage] = useState(initialData?.coverImage || "");
  const [content, setContent] = useState(initialData?.content || "");
  const [published, setPublished] = useState(initialData?.published || false);
  // datetime-local 需要 "YYYY-MM-DDTHH:mm"（本地时区）；从 ISO 串换算。
  const [publishedAt, setPublishedAt] = useState(() => toLocalInput(initialData?.publishedAt));
  const [categoryId, setCategoryId] = useState(initialData?.categoryId || "");
  const [projectId, setProjectId] = useState(initialData?.projectId || "");
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initialData?.tagIds || []
  );

  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // 管理端必须拿全量：公开 /api/tags 会隐藏零文章或只有草稿文章的标签，
    // 否则编辑器里会出现“已有标签选不到、已选标签显示不出来”的问题。
    Promise.all([
      fetch("/api/tags?all=true").then((response) => readApiData<Tag[]>(response)),
      fetch("/api/categories?all=true").then((response) => readApiData<Category[]>(response)),
      fetch("/api/collections?all=true").then((response) => readApiData<Project[]>(response)),
    ])
      .then(([nextTags, nextCategories, nextProjects]) => {
        setTags(nextTags);
        setCategories(nextCategories);
        setProjects(nextProjects);
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "加载分类和标签失败");
      });
  }, []);

  const autoSlug = (t: string) => {
    if (!isEditing || !slug) {
      setSlug(slugify(t));
    }
  };

  const handleTagToggle = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    if (!title.trim() || !content.trim()) {
      setError("标题和内容不能为空");
      setSaving(false);
      return;
    }

    const slugValue = slug.trim();
    const body = {
      title: title.trim(),
      // 编辑时清空 slug 不应悄悄改成标题派生的新 URL；省略字段让 API 保留原 slug。
      ...(slugValue
        ? { slug: slugValue }
        : isEditing
          ? {}
          : { slug: slugify(title) }),
      excerpt: excerpt.trim() || null,
      content: content.trim(),
      coverImage: coverImage.trim() || null,
      published,
      // 空值表示「未指定」：省略字段而不是发 null。服务端把显式 null 解释为
      // “清空发布日期”，曾导致草稿从后台发布后 publishedAt 变成 null。
      ...(publishedAt ? { publishedAt: new Date(publishedAt).toISOString() } : {}),
      categoryId: categoryId || null,
      projectId: projectId || null,
      tagIds: selectedTags,
    };

    try {
      const url = isEditing
        ? `/api/articles/${articleId}`
        : "/api/articles";
      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await readApiData<{ id: string }>(res);
        router.push(`/admin/articles/${data.id}`);
        router.refresh();
      } else {
        setError(await readApiError(res, "保存失败"));
      }
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && (
        <div
          role="alert"
          className="rounded-sm border border-danger/30 bg-danger-soft px-4 py-2.5 text-meta text-danger"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="标题 *"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            autoSlug(e.target.value);
          }}
        />
        <Input
          label="Slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="url-friendly-slug"
        />
      </div>

      <Textarea
        label="摘要"
        value={excerpt}
        onChange={(e) => setExcerpt(e.target.value)}
        rows={2}
        placeholder="文章简短描述（会显示在列表和 RSS 中）"
      />

      <div>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input
              label="封面图 URL"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder="https://... 或 /images/... 或留空"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setCoverPickerOpen(true)}
          >
            从图库选择
          </Button>
        </div>
        <p className="mt-1 text-micro text-ink-3">
          可从图库选择、就地上传，或粘贴外部图床地址。
        </p>
      </div>
      <ImagePickerModal
        kind="cover"
        open={coverPickerOpen}
        onClose={() => setCoverPickerOpen(false)}
        onPick={(url) => {
          setCoverPickerOpen(false);
          setCoverImage(url);
        }}
      />

      <div>
        <label className="mb-1 block text-meta font-medium text-ink-2">内容 *</label>
        <ArticleEditor value={content} onChange={setContent} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <label
            htmlFor="article-category"
            className="mb-2 block text-meta font-medium text-ink-2"
          >
            分类
          </label>
          <select
            id="article-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-10 w-full rounded-sm border border-line bg-surface px-3 text-ui text-ink transition-colors focus:border-accent focus:outline-none"
          >
            <option value="">无分类</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {categories.length === 0 && (
            <p className="mt-1.5 text-micro text-ink-3">
              还没有分类，
              <Link href="/admin/categories" className="text-primary-deep underline">
                去「分类管理」新建
              </Link>
              ；也可以先发布，之后再补。
            </p>
          )}

          <label
            htmlFor="article-project"
            className="mb-2 mt-4 block text-meta font-medium text-ink-2"
          >
            项目（可选）
          </label>
          <select
            id="article-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-10 w-full rounded-sm border border-line bg-surface px-3 text-ui text-ink transition-colors focus:border-accent focus:outline-none"
          >
            <option value="">不归入项目</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {projects.length === 0 && (
            <p className="mt-1.5 text-micro text-ink-3">
              还没有项目，
              <Link href="/admin/collections" className="text-primary-deep underline">
                去「项目管理」新建
              </Link>
              ；未归入项目的文章只在「文章」页可见。
            </p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-meta font-medium text-ink-2">标签</label>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const selected = selectedTags.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => handleTagToggle(tag.id)}
                  className={`rounded-sm px-3 py-1 text-micro font-medium transition-colors ${
                    selected
                      ? "bg-primary-solid text-on-solid"
                      : "border border-line bg-surface text-ink-2 hover:bg-surface-hover"
                  }`}
                >
                  {tag.name}
                </button>
              );
            })}
            {tags.length === 0 && (
              <span className="text-meta text-ink-3">
                暂无标签。正文里的 #标签 保存时会自动创建。
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            aria-label="切换发布状态"
            className="peer sr-only"
          />
          <div className="h-6 w-11 rounded-full bg-line-strong transition-colors peer-checked:bg-primary-solid peer-focus-visible:ring-2 peer-focus-visible:ring-accent" />
          <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow-sm transition-transform peer-checked:translate-x-5" />
        </label>
        <span className="text-meta font-medium text-ink-2">{published ? "已发布" : "草稿"}</span>
      </div>

      <div className="max-w-xs">
        <Input
          label="发布日期"
          type="datetime-local"
          value={publishedAt}
          onChange={(e) => setPublishedAt(e.target.value)}
          disabled={!published}
        />
        <p className="mt-1 text-micro text-ink-3">
          {published
            ? "留空则使用当前时间。回填旧文章时填写真实日期，归档与排序才会正确。"
            : "草稿没有发布日期，发布时再填写。"}
        </p>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "保存中…" : published ? "保存并发布" : "保存草稿"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
        >
          取消
        </Button>
      </div>
    </form>
  );
}
