import Sidebar from "./Sidebar";
import { getContentLayoutData } from "@/lib/api/public-api";

export default async function ContentLayout({ children }: { children: React.ReactNode }) {
  const sidebar = await getContentLayoutData();

  return (
    <div className="mx-auto max-w-[88rem] px-4 py-12 sm:px-6 sm:py-16">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_280px] xl:gap-14">
        <div className="min-w-0">{children}</div>
        <Sidebar
          blogTitle={sidebar.settings.blogTitle}
          blogDescription={sidebar.settings.blogDescription}
          tags={sidebar.tags}
          recentPosts={sidebar.recentPosts}
        />
      </div>
    </div>
  );
}
