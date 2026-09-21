import ArticleForm from "@/components/admin/articles/ArticleForm";

export default function NewArticlePage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-ink">新建文章</h1>
      <div className="max-w-3xl">
        <ArticleForm />
      </div>
    </div>
  );
}
