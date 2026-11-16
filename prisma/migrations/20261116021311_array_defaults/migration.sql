-- AlterTable
ALTER TABLE "PostingSnapshot" ALTER COLUMN "imageUrls" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "sourceKeys" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ScrapeRun" ALTER COLUMN "sources" SET DEFAULT ARRAY[]::TEXT[];

-- Rows that existed before the columns were added hold NULL, which Prisma's
-- list filters (isEmpty, has) do not match. Make them real empty arrays.
UPDATE "PostingSnapshot" SET "imageUrls" = '{}' WHERE "imageUrls" IS NULL;

UPDATE "Project" SET "sourceKeys" = '{}' WHERE "sourceKeys" IS NULL;

UPDATE "ScrapeRun" SET "sources" = '{}' WHERE "sources" IS NULL;
