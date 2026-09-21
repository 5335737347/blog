"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import Alert from "@/components/admin/ui/Alert";
import EmptyState from "@/components/admin/ui/EmptyState";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { formatDate } from "@/lib/utils";
import { readApiData, readApiError } from "@/lib/api-client";

type StatusFilter = "all" | "published" | "draft";

interface ArticleItem {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  publishedAt: string | null;
  updatedAt: string;
  category: { name: string; slug: string } | null;
  tags: { name: string; slug: string }[];
}

interface ArticleListData {
  items: ArticleItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const PAGE_SIZE = 20;

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "published", label: "已发布" },
  { value: "draft", label: "草稿" },
];

/**
 * 文章管理：搜索、状态/分类筛选、分页。
 *
 * 列表数据来自 listArticles 的管理端语义（published=all 才能看到草稿），
 * 分页尺寸 20：此前的 limit=50 平铺在文章超过 50 篇后静默截断，看不到
 * 第 51 篇之后的任何文章。
 */
export default function AdminDashboard() {
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [categorySlug, setCategorySlug] = useState("");
  const [categories, setCategories] = useState<{ name: string; slug: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionPending, setActionPending] = useState(false);
  /** 输入框的即时值；停顿 300ms 后才应用到 query 触发请求。 */
  const [queryInput, setQueryInput] = useState("");

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        published: status,
        limit: String(PAGE_SIZE),
        page: String(page),
      });
      if (query.trim()) params.set("q", query.trim());
      if (categorySlug) params.set("category", categorySlug);
      const res = await fetch(`/api/articles?${params.toString()}`);
      const data = await readApiData<ArticleListData>(res);
      setArticles(data.items);
      setTotal(data.total);
      setTotalPages(Math.max(1, data.totalPages));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载文章失败");
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [status, page, query, categorySlug]);

  useEffect(() => {
    // setTimeout(0)：fetch 首个 await 前会同步 setLoading，直接调用会被
    // react-hooks/set-state-in-effect 视为级联渲染；延后一拍规避。
    const id = window.setTimeout(() => {
      void fetchArticles();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchArticles]);

  useEffect(() => {
    fetch("/api/categories")
      .then((res) => readApiData<{ name: string; slug: string }[]>(res))
      .then(setCategories)
      .catch(() => {});
  }, []);

  // 搜索词防抖：停顿 300ms 后才把输入应用到查询，避免每个击键都打一次 API。
  useEffect(() => {
    const id = window.setTimeout(() => {
      setQuery(queryInput);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [queryInput]);

  const changeStatus = (next: StatusFilter) => {
    setStatus(next);
    setPage(1);
  };

  const changeCategory = (slug: string) => {
    setCategorySlug(slug);
    setPage(1);
  };

  const handleTogglePublish = async (article: ArticleItem) => {
    setActionPending(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/articles/${article.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !article.published }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "操作失败"));
        return;
      }
      setNotice(`「${article.title}」已${article.published ? "撤回" : "发布"}`);
      await fetchArticles();
    } catch {
      setError("网络错误，操作失败");
    } finally {
      setActionPending(false);
    }
  };

  const handleDelete = async (article: ArticleItem) => {
    if (!confirm(`确定删除「${article.title}」？删除后无法恢复。`)) return;
    setActionPending(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/articles/${article.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await readApiError(res, "删除失败"));
        return;
      }
      setNotice(`「${article.title}」已删除`);
      await fetchArticles();
    } catch {
      setError("网络错误，删除失败");
    } finally {
      setActionPending(false);
    }
  };

  return (
    <div>
      <AdminPageHeader
        title="文章管理"
        description={`共 ${total} 篇${status === "draft" ? "草稿" : status === "published" ? "已发布" : ""}。`}
        actions={
          <Link href="/admin/articles/new">
            <Button>新建文章</Button>
          </Link>
        }
      />

      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-56">
          <Input
            aria-label="搜索文章"
            placeholder="搜索标题、摘要、正文…"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
          />
        </div>
        <div
          role="group"
          aria-label="状态筛选"
          className="flex gap-1 rounded-sm border border-line p-0.5"
        >
          {statusFilters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => changeStatus(item.value)}
              className={`rounded-xs px-3 py-1.5 text-meta transition-colors ${
                status === item.value
                  ? "bg-primary-soft font-medium text-primary-deep"
                  : "text-ink-3 hover:bg-surface-hover"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <select
          aria-label="分类筛选"
          value={categorySlug}
          onChange={(e) => changeCategory(e.target.value)}
          className="h-10 rounded-sm border border-line bg-surface px-3 text-meta text-ink focus:border-accent focus:outline-none"
        >
          <option value="">全部分类</option>
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-ink-3">加载中…</p>
      ) : articles.length === 0 ? (
        <EmptyState
          message={query || categorySlug || status !== "all" ? "没有符合筛选条件的文章" : "暂无文章"}
          action={
            <Link href="/admin/articles/new">
              <Button variant="secondary">新建文章</Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* 移动端：卡片列表。表格在 390px 下会把状态/日期/按钮挤到逐字换行。 */}
          <div className="space-y-2 md:hidden">
            {articles.map((article) => (
              <div key={article.id} className="panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/admin/articles/${article.id}`}
                    className="min-w-0 flex-1 font-medium text-ink hover:text-primary-deep"
                  >
                    {article.title}
                  </Link>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-micro ${
                      article.published
                        ? "bg-success-soft text-success"
                        : "bg-warning-soft text-warning"
                    }`}
                  >
                    {article.published ? "已发布" : "草稿"}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-micro text-ink-3">
                  {article.category && <span>{article.category.name}</span>}
                  {article.tags.map((tag) => (
                    <span key={tag.slug}>#{tag.name}</span>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <time className="text-micro text-ink-3">{formatDate(article.updatedAt)}</time>
                  <div className="flex gap-2">
                    <Link href={`/admin/articles/${article.id}`}>
                      <Button variant="ghost" size="sm">
                        编辑
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={actionPending}
                      onClick={() => handleTogglePublish(article)}
                    >
                      {article.published ? "撤回" : "发布"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={actionPending}
                      onClick={() => handleDelete(article)}
                    >
                      <span className="text-danger">删除</span>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="panel hidden overflow-x-auto md:block">
            <table className="w-full text-left text-meta">
              <thead>
                <tr className="border-b border-line text-ink-3">
                  <th className="px-4 py-3 font-medium">标题</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">更新时间</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((article) => (
                  <tr key={article.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/articles/${article.id}`}
                        className="font-medium text-ink hover:text-primary-deep"
                      >
                        {article.title}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-micro text-ink-3">
                        {article.category && <span>{article.category.name}</span>}
                        {article.tags.map((tag) => (
                          <span key={tag.slug}>#{tag.name}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-micro ${
                          article.published
                            ? "bg-success-soft text-success"
                            : "bg-warning-soft text-warning"
                        }`}
                      >
                        {article.published ? "已发布" : "草稿"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-3">{formatDate(article.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link href={`/admin/articles/${article.id}`}>
                          <Button variant="ghost" size="sm">
                            编辑
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={actionPending}
                          onClick={() => handleTogglePublish(article)}
                        >
                          {article.published ? "撤回" : "发布"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={actionPending}
                          onClick={() => handleDelete(article)}
                        >
                          <span className="text-danger">删除</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav
              aria-label="分页"
              className="mt-4 flex items-center justify-between text-meta text-ink-3"
            >
              <span>
                第 {page} / {totalPages} 页，共 {total} 篇
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  上一页
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  下一页
                </Button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
