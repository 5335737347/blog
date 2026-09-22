-- CreateTable
CREATE TABLE "MediaImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaImage_url_key" ON "MediaImage"("url");

-- CreateIndex
CREATE INDEX "MediaImage_kind_createdAt_idx" ON "MediaImage"("kind", "createdAt");
