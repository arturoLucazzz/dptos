-- CreateEnum
CREATE TYPE "ScrapeMode" AS ENUM ('TARGET_DAILY', 'FULL_WEEKLY', 'PROBE', 'MANUAL');

-- CreateEnum
CREATE TYPE "ScrapeStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "PostingKind" AS ENUM ('UNIT', 'PROJECT');

-- CreateEnum
CREATE TYPE "Operation" AS ENUM ('SALE', 'RENT');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('PEN', 'USD');

-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL,
    "mode" "ScrapeMode" NOT NULL,
    "status" "ScrapeStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "gitSha" TEXT,
    "districtCounts" JSONB,
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "skippedDistricts" TEXT[],
    "errors" JSONB,
    "notes" TEXT,

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Posting" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'urbania',
    "sourcePostingId" TEXT NOT NULL,
    "sourcePath" TEXT,
    "slugPrefix" TEXT,
    "postingCode" TEXT,
    "kind" "PostingKind" NOT NULL,
    "operation" "Operation" NOT NULL,
    "districtSlug" TEXT NOT NULL,
    "propertyId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentSnapshotId" TEXT,

    CONSTRAINT "Posting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostingSnapshot" (
    "id" TEXT NOT NULL,
    "postingId" TEXT NOT NULL,
    "scrapeRunId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priceAmount" DECIMAL(14,2),
    "priceCurrency" "Currency",
    "pricePen" DECIMAL(14,2),
    "priceIsFrom" BOOLEAN NOT NULL DEFAULT false,
    "areaTotal" DECIMAL(8,2),
    "areaCovered" DECIMAL(8,2),
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "halfBathrooms" INTEGER,
    "parkingSpots" INTEGER,
    "maintenanceAmount" DECIMAL(10,2),
    "maintenanceCurrency" "Currency",
    "antiquityYears" INTEGER,
    "areaMin" DECIMAL(8,2),
    "areaMax" DECIMAL(8,2),
    "bedroomsMin" INTEGER,
    "bedroomsMax" INTEGER,
    "unitsCount" INTEGER,
    "developmentStage" TEXT,
    "deliveryDate" TEXT,
    "title" TEXT,
    "address" TEXT,
    "subzoneName" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "publisherId" TEXT,
    "publisherName" TEXT,
    "publisherTypeId" TEXT,
    "status" TEXT,
    "modifiedDate" TIMESTAMP(3),
    "firstDateOnline" TIMESTAMP(3),
    "hasDuplicate" BOOLEAN,
    "imageUrl" TEXT,
    "qualityFlags" TEXT[],
    "rawCard" JSONB NOT NULL,

    CONSTRAINT "PostingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "districtSlug" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "addressNorm" TEXT,
    "bedrooms" INTEGER,
    "areaBucket" INTEGER,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "discarded" BOOLEAN NOT NULL DEFAULT false,
    "discardReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assumptions" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "uit" DECIMAL(10,2) NOT NULL,
    "usdPen" DECIMAL(6,3) NOT NULL,
    "downPaymentPct" DECIMAL(5,2) NOT NULL,
    "tea" DECIMAL(5,2) NOT NULL,
    "tcea" DECIMAL(5,2) NOT NULL,
    "termYears" INTEGER NOT NULL,
    "vacancyMonthsPerYear" DECIMAL(4,2) NOT NULL,
    "rentGrowthPct" DECIMAL(5,2) NOT NULL,
    "rentIncomeTaxPct" DECIMAL(5,2) NOT NULL,
    "defaultMaintenancePerM2" DECIMAL(6,2) NOT NULL,
    "alcabalaRatePct" DECIMAL(5,2) NOT NULL,
    "alcabalaExemptUit" DECIMAL(5,2) NOT NULL,
    "notaryCost" DECIMAL(10,2) NOT NULL,
    "registryPct" DECIMAL(5,3) NOT NULL,
    "appraisalCost" DECIMAL(10,2) NOT NULL,
    "titleStudyCost" DECIMAL(10,2) NOT NULL,
    "assessedValueRatio" DECIMAL(5,3) NOT NULL,
    "arbitriosByDistrict" JSONB NOT NULL,
    "defaultArbitrios" DECIMAL(10,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScrapeRun_startedAt_idx" ON "ScrapeRun"("startedAt");

-- CreateIndex
CREATE INDEX "ScrapeRun_mode_startedAt_idx" ON "ScrapeRun"("mode", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Posting_currentSnapshotId_key" ON "Posting"("currentSnapshotId");

-- CreateIndex
CREATE INDEX "Posting_districtSlug_operation_idx" ON "Posting"("districtSlug", "operation");

-- CreateIndex
CREATE INDEX "Posting_lastSeenAt_idx" ON "Posting"("lastSeenAt");

-- CreateIndex
CREATE INDEX "Posting_propertyId_idx" ON "Posting"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "Posting_source_sourcePostingId_operation_key" ON "Posting"("source", "sourcePostingId", "operation");

-- CreateIndex
CREATE INDEX "PostingSnapshot_postingId_observedAt_idx" ON "PostingSnapshot"("postingId", "observedAt");

-- CreateIndex
CREATE INDEX "PostingSnapshot_scrapeRunId_idx" ON "PostingSnapshot"("scrapeRunId");

-- CreateIndex
CREATE INDEX "PostingSnapshot_observedAt_idx" ON "PostingSnapshot"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Property_fingerprint_key" ON "Property"("fingerprint");

-- CreateIndex
CREATE INDEX "Property_districtSlug_idx" ON "Property"("districtSlug");

-- CreateIndex
CREATE INDEX "Property_favorite_idx" ON "Property"("favorite");

-- AddForeignKey
ALTER TABLE "Posting" ADD CONSTRAINT "Posting_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posting" ADD CONSTRAINT "Posting_currentSnapshotId_fkey" FOREIGN KEY ("currentSnapshotId") REFERENCES "PostingSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostingSnapshot" ADD CONSTRAINT "PostingSnapshot_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "Posting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostingSnapshot" ADD CONSTRAINT "PostingSnapshot_scrapeRunId_fkey" FOREIGN KEY ("scrapeRunId") REFERENCES "ScrapeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
