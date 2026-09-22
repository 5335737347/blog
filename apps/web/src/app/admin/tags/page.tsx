"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import Alert from "@/components/admin/ui/Alert";
import EmptyState from "@/components/admin/ui/EmptyState";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { TaxonomyWithCount } from "@kpblog/contracts";
import { readApiData, readApiError } from "@/lib/api-client";

type Tag = TaxonomyWithCount;

/**
 * 标签管理：全量列表（含 0 篇文章的未使用标签）、新建、重命名、删除、合并。
 *
 * 标签大多由正文 #标签 与导入自动产生，长期会积累近重复项；合并把源标签的
 * 文章关联整体迁给目标标签后删除源标签，是清理这类噪音的主要手段。
 */
export default function TagsAdminPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [filter, setFilter] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [saving, setSaving] = useState(false);

  const [mergingId, setMergingId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergePending, setMergePending] = useState(false);
  const [cleanupPending, setCleanupPending] = useState(false);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tags?all=true");
      setTags(await readApiData<Tag[]>(res));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载标签失败");
      setTags([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // setTimeout(0)：fetch 首个 await 前会同步 setLoading，直接调用会被
    // react-hooks/set-state-in-effect 视为级联渲染；延后一拍规避。
    const id = window.setTimeout(() => {
      void fetchTags();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchTags]);

  const visibleTags = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    if (!keyword) return tags;
    return tags.filter(
      (tag) => tag.name.toLowerCase().includes(keyword) || tag.slug.includes(keyword)
    );
  }, [tags, filter]);

  const unusedCount = useMemo(() => tags.filter((tag) => tag.postCount === 0).length, [tags]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "新建标签失败"));
        return;
      }
      setNotice(`标签「${newName.trim()}」已创建`);
      setNewName("");
      await fetchTags();
    } catch {
      setError("网络错误，新建标签失败");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditSlug("");
    setMergingId(null);
    setNotice("");
    setError("");
  };

  const handleCleanupOrphans = async () => {
    if (unusedCount === 0) return;
    if (!confirm(`确定删除全部 ${unusedCount} 个未使用标签？`)) return;
    setCleanupPending(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/tags/orphaned", { method: "DELETE" });
      if (!res.ok) {
        setError(await readApiError(res, "清理失败"));
        return;
      }
      const data = await readApiData<{ deleted: number }>(res);
      setNotice(`已清理 ${data.deleted} 个未使用标签`);
      await fetchTags();
    } catch {
      setError("网络错误，清理失败");
    } finally {
      setCleanupPending(false);
    }
  };

  const handleSave = async (id: string) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/tags/${id}`, {
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
      setNotice("标签已更新");
      setEditingId(null);
      await fetchTags();
    } catch {
      setError("网络错误，保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleMerge = async (source: Tag) => {
    const target = tags.find((tag) => tag.id === mergeTargetId);
    if (!target) {
      setError("请先选择要合并到的目标标签");
      return;
    }
    const countText =
      source.postCount > 0 ? `其 ${source.postCount} 篇文章的关联将转移给「${target.name}」` : "";
    if (!confirm(`确定把标签「${source.name}」合并进「${target.name}」？${countText}，合并后「${source.name}」将被删除。`)) {
      return;
    }
    setMergePending(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/tags/${source.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: target.id }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "合并失败"));
        return;
      }
      setNotice(`「${source.name}」已合并进「${target.name}」`);
      setMergingId(null);
      setMergeTargetId("");
      await fetchTags();
    } catch {
      setError("网络错误，合并失败");
    } finally {
      setMergePending(false);
    }
  };

  const handleDelete = async (tag: Tag) => {
    const countText =
      tag.postCount > 0 ? `，将从 ${tag.postCount} 篇文章上移除该标签（文章保留）` : "";
    if (!confirm(`确定删除标签「${tag.name}」？${countText}。`)) return;
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await readApiError(res, "删除失败"));
        return;
      }
      setNotice(`标签「${tag.name}」已删除`);
      await fetchTags();
    } catch {
      setError("网络错误，删除失败");
    }
  };

  return (
    <div>
      <AdminPageHeader
        title="标签管理"
        description={`共 ${tags.length} 个标签${unusedCount > 0 ? `，其中 ${unusedCount} 个未挂任何文章` : ""}。计数包含草稿。`}
        actions={
          <div className="flex items-center gap-2">
            <Input
              aria-label="筛选标签"
              placeholder="筛选标签…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-44"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={cleanupPending || unusedCount === 0}
              onClick={handleCleanupOrphans}
            >
              {cleanupPending ? "清理中…" : "清理未使用"}
            </Button>
          </div>
        }
      />

      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <form onSubmit={handleCreate} className="panel mb-6 flex flex-wrap items-end gap-3 p-4">
        <div className="w-48">
          <Input
            label="标签名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={50}
            required
          />
        </div>
        <Button type="submit" disabled={creating || !newName.trim()}>
          {creating ? "创建中…" : "新建标签"}
        </Button>
        <p className="pb-2 text-micro text-ink-3">
          文章正文里的 #标签 在保存时也会自动创建，无需预先建好。
        </p>
      </form>

      {loading ? (
        <p className="text-ink-3">加载中…</p>
      ) : visibleTags.length === 0 ? (
        <EmptyState message={filter ? `没有匹配「${filter}」的标签` : "还没有标签"} />
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
              {visibleTags.map((tag) => {
                const editing = editingId === tag.id;
                const merging = mergingId === tag.id;
                const unused = tag.postCount === 0;
                return (
                  <tr key={tag.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3">
                      {editing ? (
                        <Input
                          aria-label="标签名称"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={50}
                          className="w-40"
                        />
                      ) : (
                        <span className={`font-medium ${unused ? "text-ink-3" : "text-ink"}`}>
                          {tag.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <div>
                          <Input
                            aria-label="链接标识"
                            value={editSlug}
                            onChange={(e) => setEditSlug(e.target.value)}
                            placeholder={tag.slug}
                            className="w-40"
                          />
                          <p className="mt-1 text-micro text-warning">
                            填写将改变公开链接；留空保持 {tag.slug}
                          </p>
                        </div>
                      ) : (
                        <code className="text-ink-3">{tag.slug}</code>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={unused ? "text-ink-3" : "text-ink-2"}>
                        {unused ? "未使用" : tag.postCount}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {editing ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => handleSave(tag.id)}
                              disabled={saving || !editName.trim()}
                            >
                              保存
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                              取消
                            </Button>
                          </>
                        ) : merging ? (
                          <>
                            <select
                              aria-label="合并目标标签"
                              value={mergeTargetId}
                              onChange={(e) => setMergeTargetId(e.target.value)}
                              className="h-8 rounded-sm border border-line bg-surface px-2 text-meta text-ink focus:border-accent focus:outline-none"
                            >
                              <option value="">选择目标标签…</option>
                              {tags
                                .filter((other) => other.id !== tag.id)
                                .map((other) => (
                                  <option key={other.id} value={other.id}>
                                    {other.name}（{other.postCount}）
                                  </option>
                                ))}
                            </select>
                            <Button
                              size="sm"
                              onClick={() => handleMerge(tag)}
                              disabled={mergePending || !mergeTargetId}
                            >
                              {mergePending ? "合并中…" : "确认合并"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setMergingId(null);
                                setMergeTargetId("");
                              }}
                            >
                              取消
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => startEdit(tag)}>
                              编辑
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setMergingId(tag.id);
                                setMergeTargetId("");
                                setEditingId(null);
                              }}
                            >
                              合并
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(tag)}>
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
