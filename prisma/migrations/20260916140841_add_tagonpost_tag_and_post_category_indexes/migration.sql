-- CreateIndex
CREATE INDEX "Post_categoryId_idx" ON "Post"("categoryId");

-- CreateIndex
CREATE INDEX "TagOnPost_tagId_idx" ON "TagOnPost"("tagId");
