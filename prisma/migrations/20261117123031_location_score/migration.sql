-- CreateEnum
CREATE TYPE "ZoneKind" AS ENUM ('DISTRICT', 'CIRCLE');

-- CreateEnum
CREATE TYPE "LocationStatus" AS ENUM ('OK', 'OUTSIDE_LIMA', 'NO_COORDINATES');

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ZoneKind" NOT NULL,
    "districtSlug" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "radiusM" INTEGER,
    "rating" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistrictStat" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "incomePerCapitaPen" DECIMAL(10,2),
    "incomeSource" TEXT,
    "incomeDate" TEXT,
    "complaintsPer10k" DECIMAL(10,2),
    "complaintsSource" TEXT,
    "complaintsDate" TEXT,
    "boundary" JSONB,

    CONSTRAINT "DistrictStat_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "PropertyLocation" (
    "propertyId" TEXT NOT NULL,
    "status" "LocationStatus" NOT NULL,
    "score" DECIMAL(3,1),
    "livability" DECIMAL(3,1),
    "demand" DECIMAL(3,1),
    "reasons" JSONB NOT NULL,
    "localRentPerM2" DECIMAL(10,2),
    "localRentHighPerM2" DECIMAL(10,2),
    "localRentN" INTEGER,
    "localRentMaxDistanceM" INTEGER,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyLocation_pkey" PRIMARY KEY ("propertyId")
);

-- CreateIndex
CREATE INDEX "Place_category_idx" ON "Place"("category");

-- AddForeignKey
ALTER TABLE "PropertyLocation" ADD CONSTRAINT "PropertyLocation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
