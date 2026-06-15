import ArticleForm from "@/components/admin/ArticleForm";

export default function NewArticlePage() {
  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold text-purple-950 dark:text-purple-50">
        ✨ 新建文章
      </h2>
      <div className="max-w-3xl">
        <ArticleForm />
      </div>
    </div>
  );
}
