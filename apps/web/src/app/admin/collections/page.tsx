"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import Alert from "@/components/admin/ui/Alert";
import EmptyState from "@/components/admin/ui/EmptyState";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import ImagePickerModal from "@/components/admin/resources/ImagePickerModal";
import { readApiData, readApiError } from "@/lib/api-client";

interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  coverImage: string | null;
  postCount: number;
}

/**
 * 项目合集管理：新建、重命名、简介与封面、删除。
 * slug 是公开 URL（/collections/[slug]）的一部分：重命名默认只改显示名，
 * slug 输入框留空表示「不改」。
 */
export default function CollectionsAdminPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCover, setEditCover] = useState("");
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/collections?all=true");
      setProjects(await readApiData<Project[]>(res));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载项目失败");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchProjects();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchProjects]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          slug: newSlug || undefined,
          description: newDescription || undefined,
        }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "新建项目失败"));
        return;
      }
      setNotice(`项目「${newName.trim()}」已创建`);
      setNewName("");
      setNewSlug("");
      setNewDescription("");
      await fetchProjects();
    } catch {
      setError("网络错误，新建项目失败");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (project: Project) => {
    setEditingId(project.id);
    setEditName(project.name);
    setEditSlug("");
    setEditDescription(project.description);
    setEditCover(project.coverImage ?? "");
    setNotice("");
    setError("");
  };

  const handleSave = async (id: string) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/collections/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          description: editDescription,
          coverImage: editCover.trim() || null,
          ...(editSlug.trim() ? { slug: editSlug.trim() } : {}),
        }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "保存失败"));
        return;
      }
      setNotice("项目已更新");
      setEditingId(null);
      await fetchProjects();
    } catch {
      setError("网络错误，保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (project: Project) => {
    const countText =
      project.postCount > 0 ? `，${project.postCount} 篇文章将不再属于任何项目（文章保留）` : "";
    if (!confirm(`确定删除项目「${project.name}」？${countText}。`)) return;
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/collections/${project.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await readApiError(res, "删除失败"));
        return;
      }
      setNotice(`项目「${project.name}」已删除`);
      await fetchProjects();
    } catch {
      setError("网络错误，删除失败");
    }
  };

  return (
    <div>
      <AdminPageHeader
        title="项目管理"
        description="项目是写作期间的工作单元，项目页汇集其下全部文章；删除项目不会删除文章。"
      />

      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      <form onSubmit={handleCreate} className="panel mb-6 flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Input
              label="项目名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={50}
              required
            />
          </div>
          <div className="w-44">
            <Input
              label="链接标识（可选）"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              placeholder="默认按名称自动生成"
            />
          </div>
          <Button type="submit" disabled={creating || !newName.trim()}>
            {creating ? "创建中…" : "新建项目"}
          </Button>
        </div>
        <div className="max-w-xl">
          <Textarea
            label="项目简介（可选）"
            rows={2}
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="展示在项目页头部"
          />
        </div>
      </form>

      {loading ? (
        <p className="text-ink-3">加载中…</p>
      ) : projects.length === 0 ? (
        <EmptyState message="还没有项目。在文章编辑表单里把文章归入项目后，它会出现在「项目」页的卡片里。" />
      ) : (
        <div className="space-y-3">
          {projects.map((project) => {
            const editing = editingId === project.id;
            return (
              <div key={project.id} className="panel p-4">
                {editing ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="w-44">
                        <Input
                          label="项目名称"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={50}
                        />
                      </div>
                      <div className="w-44">
                        <Input
                          label="链接标识"
                          value={editSlug}
                          onChange={(e) => setEditSlug(e.target.value)}
                          placeholder={project.slug}
                        />
                        <p className="mt-1 text-micro text-warning">
                          填写将改变公开链接；留空保持 {project.slug}
                        </p>
                      </div>
                      <div className="flex min-w-0 flex-1 items-end gap-2">
                        <div className="min-w-0 flex-1">
                          <Input
                            label="封面地址（可选）"
                            value={editCover}
                            onChange={(e) => setEditCover(e.target.value)}
                            placeholder="留空表示无封面"
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
                    </div>
                    <div className="max-w-xl">
                      <Textarea
                        label="项目简介"
                        rows={2}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSave(project.id)}
                        disabled={saving || !editName.trim()}
                      >
                        保存
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        取消
                      </Button>
                    </div>
                    <ImagePickerModal
                      kind="cover"
                      open={coverPickerOpen}
                      onClose={() => setCoverPickerOpen(false)}
                      onPick={(url) => {
                        setCoverPickerOpen(false);
                        setEditCover(url);
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-baseline gap-2">
                        <span className="text-ui font-medium text-ink">{project.name}</span>
                        <code className="text-micro text-ink-3">{project.slug}</code>
                        <span className="text-micro text-ink-3">
                          {project.postCount > 0 ? `${project.postCount} 篇` : "暂无文章"}
                        </span>
                      </p>
                      {project.description && (
                        <p className="mt-1 max-w-xl whitespace-pre-line text-meta text-ink-2">
                          {project.description}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(project)}>
                        编辑
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(project)}>
                        <span className="text-danger">删除</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
