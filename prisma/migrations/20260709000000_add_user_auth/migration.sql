-- Existing installations only had administrator users, so preserve their access.
ALTER TABLE "User" ADD COLUMN "email" TEXT;
ALTER TABLE "User" ADD COLUMN "displayName" TEXT;
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'USER';
UPDATE "User" SET "role" = 'ADMIN';

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

ALTER TABLE "Comment" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");
