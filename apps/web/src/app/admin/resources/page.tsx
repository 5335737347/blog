import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import CoverImageManager from "@/components/admin/resources/CoverImageManager";
import MusicManager from "@/components/admin/resources/MusicManager";

/**
 * 资源管理：封面图片与音乐两个板块的合并入口。
 * 2026-09-21 由「音乐管理」扩展而来；旧链接 /admin/music 301 到这里。
 */
export default function ResourcesAdminPage() {
  return (
    <div className="space-y-10">
      <AdminPageHeader
        title="资源管理"
        description="管理站点的封面图片与背景音乐；图片复制地址后可粘贴到文章「封面图 URL」。"
      />
      <CoverImageManager />
      <MusicManager />
    </div>
  );
}
