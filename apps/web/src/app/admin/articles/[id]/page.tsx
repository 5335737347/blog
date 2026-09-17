"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import ArticleForm from "@/components/admin/articles/ArticleForm";
import { readApiData, readApiError } from "@/lib/api-client";

interface ArticleData {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string | null;
  content: string;
  published: boolean;
  publishedAt: string | null;
  categoryId: string;
  tags: { id: string; name: string; slug: string }[];
}

export default function EditArticlePage() {
  const { id } = useParams<{ id: string }>();
  const [article, setArticle] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/articles/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiError(res, "加载文章失败"));
        return readApiData<ArticleData>(res);
      })
      .then((data) => {
        setArticle(data);
        setLoading(false);
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "加载文章失败");
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return <p className="text-purple-400 dark:text-purple-500">加载中...</p>;
  }

  if (error || !article) {
    return <p role="alert" className="text-red-600 dark:text-red-300">{error || "文章不存在"}</p>;
  }

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-purple-950 dark:text-purple-50">
        📝 编辑文章
      </h2>
      <div className="max-w-3xl">
        <ArticleForm
          key={article.id}
          isEditing
          articleId={article.id}
          initialData={{
            title: article.title,
            slug: article.slug,
            excerpt: article.excerpt || "",
            coverImage: article.coverImage || "",
            content: article.content,
            published: article.published,
            publishedAt: article.publishedAt,
            categoryId: article.categoryId || "",
            tagIds: article.tags.map((t) => t.id),
          }}
        />
      </div>
    </div>
  );
}
