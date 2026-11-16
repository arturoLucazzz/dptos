-- CreateEnum
CREATE TYPE "DuplicateLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "DuplicateStatus" AS ENUM ('OPEN', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "Posting" ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "removedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PostingSnapshot" ADD COLUMN     "buildingName" TEXT,
ADD COLUMN     "developerName" TEXT,
ADD COLUMN     "imageUrls" TEXT[],
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "unitNumber" TEXT;

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "buildingNorm" TEXT,
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "streetNorm" TEXT,
ADD COLUMN     "unitNumber" TEXT;

-- AlterTable
ALTER TABLE "ScrapeRun" ADD COLUMN     "sources" TEXT[];

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "districtSlug" TEXT NOT NULL,
    "name" TEXT,
    "nameNorm" TEXT,
    "developerName" TEXT,
    "addressNorm" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "deliveryDate" TEXT,
    "stage" TEXT,
    "sourceKeys" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateCandidate" (
    "id" TEXT NOT NULL,
    "propertyAId" TEXT NOT NULL,
    "propertyBId" TEXT NOT NULL,
    "level" "DuplicateLevel" NOT NULL,
    "signals" JSONB NOT NULL,
    "status" "DuplicateStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "DuplicateCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_districtSlug_idx" ON "Project"("districtSlug");

-- CreateIndex
CREATE INDEX "Project_nameNorm_idx" ON "Project"("nameNorm");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateCandidate_propertyAId_propertyBId_key" ON "DuplicateCandidate"("propertyAId", "propertyBId");

-- CreateIndex
CREATE INDEX "Posting_projectId_idx" ON "Posting"("projectId");

-- CreateIndex
CREATE INDEX "Property_streetNorm_idx" ON "Property"("streetNorm");

-- CreateIndex
CREATE INDEX "Property_buildingNorm_idx" ON "Property"("buildingNorm");

-- CreateIndex
CREATE INDEX "Property_projectId_idx" ON "Property"("projectId");

-- AddForeignKey
ALTER TABLE "Posting" ADD CONSTRAINT "Posting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_propertyAId_fkey" FOREIGN KEY ("propertyAId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateCandidate" ADD CONSTRAINT "DuplicateCandidate_propertyBId_fkey" FOREIGN KEY ("propertyBId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
