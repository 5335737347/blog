-- 回复列表按 parentId 过滤（`parentId IN (...)`），此前没有对应索引，
-- 每次打开文章页/留言板都会对 Comment 全表扫描。
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");
