-- CreateTable
CREATE TABLE "HomeWallpaper" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "HomeWallpaper_url_key" ON "HomeWallpaper"("url");

-- CreateIndex
CREATE INDEX "HomeWallpaper_enabled_sortOrder_idx" ON "HomeWallpaper"("enabled", "sortOrder");
