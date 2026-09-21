import { redirect } from "next/navigation";

/**
 * 「音乐管理」已并入「资源管理」；旧链接与书签统一跳转。
 */
export default function MusicAdminPage() {
  redirect("/admin/resources");
}
