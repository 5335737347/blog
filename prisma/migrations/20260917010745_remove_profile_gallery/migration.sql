-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Profile" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "name" TEXT NOT NULL DEFAULT '',
    "headline" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "avatar" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "now" TEXT NOT NULL DEFAULT '',
    "socialLinks" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Profile" ("avatar", "bio", "email", "headline", "id", "location", "name", "now", "socialLinks", "updatedAt") SELECT "avatar", "bio", "email", "headline", "id", "location", "name", "now", "socialLinks", "updatedAt" FROM "Profile";
DROP TABLE "Profile";
ALTER TABLE "new_Profile" RENAME TO "Profile";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

