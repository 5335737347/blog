ALTER TABLE "User" ADD COLUMN "apiKey" TEXT;

CREATE UNIQUE INDEX "User_apiKey_key" ON "User"("apiKey");
