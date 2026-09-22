"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import Alert from "@/components/admin/ui/Alert";
import EmptyState from "@/components/admin/ui/EmptyState";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { TaxonomyWithCount } from "@kpblog/contracts";
import { readApiData, readApiError } from "@/lib/api-client";

type Category = TaxonomyWithCount;

/**
 * 分类管理：新建、重命名、删除。
 *
 * slug 是公开 URL（/categories/[slug]）的一部分：重命名默认只改显示名，
 * slug 输入框默认留空表示「不改」，填了才更新——界面与 API 的语义一致。
 */
export default function CategoriesAdminPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/categories?all=true");
      setCategories(await readApiData<Category[]>(res));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载分类失败");
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // setTimeout(0)：fetch 首个 await 前会同步 setLoading，直接调用会被
    // react-hooks/set-state-in-effect 视为级联渲染；延后一拍规避。
    const id = window.setTimeout(() => {
      void fetchCategories();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchCategories]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, slug: newSlug || undefined }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "新建分类失败"));
        return;
      }
      setNotice(`分类「${newName.trim()}」已创建`);
      setNewName("");
      setNewSlug("");
      await fetchCategories();
    } catch {
      setError("网络错误，新建分类失败");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (category: Category) => {
    setEditingId(category.id);
    setEditName(category.name);
    // 留空 = 不改 slug；填了才提交。
    setEditSlug("");
    setNotice("");
    setError("");
  };

  const handleSave = async (id: string) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          ...(editSlug.trim() ? { slug: editSlug.trim() } : {}),
        }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "保存失败"));
        return;
      }
      setNotice("分类已更新");
      setEditingId(null);
      await fetchCategories();
    } catch {
      setError("网络错误，保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (category: Category) => {
    const countText =
      category.postCount > 0 ? `，${category.postCount} 篇文章的分类将被清空（文章保留）` : "";
    if (!confirm(`确定删除分类「${category.name}」？${countText}。`)) return;
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/categories/${category.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await readApiError(res, "删除失败"));
        return;
      }
      setNotice(`分类「${category.name}」已删除`);
      await fetchCategories();
    } catch {
      setError("网络错误，删除失败");
    }
  };

  return (
    <div>
      <AdminPageHeader
        title="分类管理"
        description="分类是少量、刻意维护的导航结构；删除分类不会删除文章。文章数含草稿。"
      />

      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <form onSubmit={handleCreate} className="panel mb-6 flex flex-wrap items-end gap-3 p-4">
        <div className="w-48">
          <Input
            label="分类名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={50}
            required
          />
        </div>
        <div className="w-48">
          <Input
            label="链接标识（可选）"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            placeholder="默认按名称自动生成"
          />
        </div>
        <Button type="submit" disabled={creating || !newName.trim()}>
          {creating ? "创建中…" : "新建分类"}
        </Button>
      </form>

      {loading ? (
        <p className="text-ink-3">加载中…</p>
      ) : categories.length === 0 ? (
        <EmptyState message="还没有分类。文章可以在没有分类的情况下发布，也可以之后再到这里补充。" />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-meta">
            <thead>
              <tr className="border-b border-line text-ink-3">
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">slug</th>
                <th className="px-4 py-3 font-medium">文章数</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const editing = editingId === category.id;
                return (
                  <tr key={category.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3">
                      {editing ? (
                        <Input
                          aria-label="分类名称"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={50}
                          className="w-40"
                        />
                      ) : (
                        <span className="font-medium text-ink">{category.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <div>
                          <Input
                            aria-label="链接标识"
                            value={editSlug}
                            onChange={(e) => setEditSlug(e.target.value)}
                            placeholder={category.slug}
                            className="w-40"
                          />
                          <p className="mt-1 text-micro text-warning">
                            填写将改变公开链接；留空保持 {category.slug}
                          </p>
                        </div>
                      ) : (
                        <code className="text-ink-3">{category.slug}</code>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-3">{category.postCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {editing ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleSave(category.id)}
                              disabled={saving || !editName.trim()}
                            >
                              保存
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                              取消
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => startEdit(category)}>
                              编辑
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(category)}>
                              <span className="text-danger">删除</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
