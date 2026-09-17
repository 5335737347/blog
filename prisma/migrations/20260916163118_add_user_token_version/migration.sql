-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "displayName" TEXT,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "apiKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_User" ("apiKey", "createdAt", "displayName", "email", "id", "password", "phone", "role", "username") SELECT "apiKey", "createdAt", "displayName", "email", "id", "password", "phone", "role", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "User_apiKey_key" ON "User"("apiKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
