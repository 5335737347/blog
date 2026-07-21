"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";
import { readApiData, readApiError } from "@/lib/api-client";

interface ArticleItem {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  publishedAt: string | null;
  updatedAt: string;
  category: { name: string } | null;
}

export default function AdminDashboard() {
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchArticles = useCallback(async () => {
    const res = await fetch("/api/articles?published=all&limit=50");
    const data = await readApiData<{ items: ArticleItem[] }>(res);
    setArticles(data.items);
    setLoading(false);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchArticles();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchArticles]);

  const handleTogglePublish = async (article: ArticleItem) => {
    const res = await fetch(`/api/articles/${article.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !article.published }),
    });
    if (!res.ok) {
      alert(`操作失败: ${await readApiError(res, String(res.status))}`);
      return;
    }
    fetchArticles();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这篇文章吗？")) return;
    const res = await fetch(`/api/articles/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert(`删除失败: ${await readApiError(res, String(res.status))}`);
      return;
    }
    fetchArticles();
  };

  if (loading) {
    return <p className="text-gray-500">加载中...</p>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-purple-950 dark:text-purple-50">
          文章管理
          <span className="ml-2 text-sm font-normal text-purple-300 dark:text-purple-500">
            ({articles.length})
          </span>
        </h2>
        <Link href="/admin/articles/new">
          <Button>新建文章</Button>
        </Link>
      </div>

      {articles.length === 0 ? (
        <p className="py-20 text-center text-purple-300 dark:text-purple-500">🌸 暂无文章</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-pink-100 dark:border-purple-800/30">
              <tr>
                <th className="pb-3 font-medium text-purple-400 dark:text-purple-500">
                  标题
                </th>
                <th className="pb-3 font-medium text-purple-400 dark:text-purple-500">
                  状态
                </th>
                <th className="pb-3 font-medium text-purple-400 dark:text-purple-500">
                  更新时间
                </th>
                <th className="pb-3 font-medium text-purple-400 dark:text-purple-500">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {articles.map((article) => (
                <tr
                  key={article.id}
                  className="border-b border-pink-50 dark:border-purple-800/20"
                >
                  <td className="py-3 pr-4">
                    <Link
                      href={`/admin/articles/${article.id}`}
                      className="font-medium text-purple-900 hover:text-pink-600 dark:text-purple-100 dark:hover:text-pink-400"
                    >
                      {article.title}
                    </Link>
                    {article.category && (
                      <span className="ml-2 text-xs text-gray-400">
                        {article.category.name}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                        article.published
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                      }`}
                    >
                      {article.published ? "已发布" : "草稿"}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-purple-400 dark:text-purple-500">
                    {formatDate(article.updatedAt)}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-2">
                      <Link href={`/admin/articles/${article.id}`}>
                        <Button variant="ghost" size="sm">
                          编辑
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTogglePublish(article)}
                      >
                        {article.published ? "撤回" : "发布"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(article.id)}
                      >
                        <span className="text-red-600 dark:text-red-400">
                          删除
                        </span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
