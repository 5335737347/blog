"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import ArticleEditor from "./ArticleEditor";
import { slugify } from "@/lib/utils";

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

interface ArticleFormData {
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string;
  content: string;
  published: boolean;
  categoryId: string;
  tagIds: string[];
}

interface ArticleFormProps {
  initialData?: ArticleFormData;
  isEditing?: boolean;
  articleId?: string;
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
  const [categoryId, setCategoryId] = useState(initialData?.categoryId || "");
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initialData?.tagIds || []
  );

  const [tags, setTags] = useState<Tag[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then(setTags);
    fetch("/api/categories")
      .then((r) => r.json())
      .then(setCategories);
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

    const body = {
      title: title.trim(),
      slug: slug.trim() || slugify(title),
      excerpt: excerpt.trim() || null,
      content: content.trim(),
      coverImage: coverImage.trim() || null,
      published,
      categoryId: categoryId || null,
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
        const data = await res.json();
        router.push(`/admin/articles/${data.id}`);
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "保存失败");
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
        <div className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
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

      <Input
        label="封面图 URL"
        value={coverImage}
        onChange={(e) => setCoverImage(e.target.value)}
        placeholder="https://... 或 /images/... 或留空"
      />

      <div>
        <label className="mb-1 block text-sm font-medium text-purple-800 dark:text-purple-200">
          内容 *
        </label>
        <ArticleEditor value={content} onChange={setContent} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-purple-800 dark:text-purple-200">
            分类
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-2xl border-2 border-pink-200 bg-white px-4 py-2.5 text-sm text-purple-950 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:border-purple-700 dark:bg-purple-950/50 dark:text-purple-100 dark:focus:border-pink-400 dark:focus:ring-pink-900/30 transition-all"
          >
            <option value="">无分类</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-purple-800 dark:text-purple-200">
            标签
          </label>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => handleTagToggle(tag.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all hover:scale-105 ${
                  selectedTags.includes(tag.id)
                    ? "bg-gradient-to-r from-pink-400 to-purple-400 text-white shadow-sm shadow-pink-200 dark:from-pink-500 dark:to-purple-500"
                    : "bg-pink-50 text-pink-600 hover:bg-pink-100 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/40"
                }`}
              >
                {tag.name}
              </button>
            ))}
            {tags.length === 0 && (
              <span className="text-sm text-purple-300 dark:text-purple-600">
                暂无标签
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
            className="peer sr-only"
          />
          <div className="h-6 w-11 rounded-full bg-pink-200 transition-colors peer-checked:bg-gradient-to-r peer-checked:from-pink-400 peer-checked:to-purple-400 peer-focus:ring-2 peer-focus:ring-purple-300 dark:bg-purple-800 dark:peer-focus:ring-purple-600" />
          <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
        </label>
        <span className="text-sm font-medium text-purple-800 dark:text-purple-200">
          {published ? "✨ 已发布" : "📝 草稿"}
        </span>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "保存中..." : published ? "保存并发布" : "保存草稿"}
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
