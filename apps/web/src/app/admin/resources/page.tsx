import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import AdoptImagesButton from "@/components/admin/resources/AdoptImagesButton";
import ImageLibrarySection from "@/components/admin/resources/ImageLibrarySection";
import WallpaperManager from "@/components/admin/resources/WallpaperManager";
import MusicManager from "@/components/admin/resources/MusicManager";

/**
 * 资源管理：封面图片、文章图片与音乐。
 * 图片是登记表（本地文件 + 外部图床 URL 统一入库），kind 区分两个板块；
 * 「扫描收编」把现有文章里引用的图片 URL 批量登记进来。
 * 旧链接 /admin/music 301 到这里。
 */
export default function ResourcesAdminPage() {
  return (
    <div className="space-y-10">
      <AdminPageHeader
        title="资源管理"
        description="管理站点的封面图片、文章正文图片、首页壁纸与背景音乐。"
        actions={<AdoptImagesButton />}
      />
      <ImageLibrarySection
        kind="cover"
        title="封面图片"
        description="文章封面的候选图库。删除仍被文章使用的封面会被拒绝，除非强制删除。"
        emptyText="还没有封面。可上传本地图片、登记外部图床地址，或点右上角「扫描收编」把现有文章的封面收进来。"
      />
      <ImageLibrarySection
        kind="article"
        title="文章图片"
        description="文章正文里使用的图片。编辑器工具栏的「上传图片 / 从图库选择」写入的就是这里。"
        emptyText="还没有文章图片。可在编辑器里直接上传，或在这里登记外部图床地址。"
      />
      <WallpaperManager />
      <MusicManager />
    </div>
  );
}
