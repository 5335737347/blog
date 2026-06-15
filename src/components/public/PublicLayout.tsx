import Sidebar from "./Sidebar";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_260px]">
        <div className="min-w-0">{children}</div>
        <Sidebar />
      </div>
    </div>
  );
}
