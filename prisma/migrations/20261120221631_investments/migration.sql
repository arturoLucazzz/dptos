-- AlterEnum
ALTER TYPE "ZoneKind" ADD VALUE 'POLYGON';

-- AlterTable
ALTER TABLE "Zone" ADD COLUMN     "boundary" JSONB;

-- CreateTable
CREATE TABLE "Investment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentItem" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "propertyId" TEXT,
    "projectId" TEXT,
    "note" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvestmentItem_investmentId_position_idx" ON "InvestmentItem"("investmentId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentItem_investmentId_propertyId_key" ON "InvestmentItem"("investmentId", "propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentItem_investmentId_projectId_key" ON "InvestmentItem"("investmentId", "projectId");

-- AddForeignKey
ALTER TABLE "InvestmentItem" ADD CONSTRAINT "InvestmentItem_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentItem" ADD CONSTRAINT "InvestmentItem_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentItem" ADD CONSTRAINT "InvestmentItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one of propertyId and projectId is set.
ALTER TABLE "InvestmentItem" ADD CONSTRAINT "InvestmentItem_exactly_one_target"
  CHECK (("propertyId" IS NULL) <> ("projectId" IS NULL));

-- Carry the old favorites and notes into one "Favoritos" investment.
INSERT INTO "Investment" ("id", "name", "filters", "updatedAt")
SELECT 'favoritos_migrated', 'Favoritos', '{}', CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "Property" WHERE "favorite" = true OR "notes" IS NOT NULL);

INSERT INTO "InvestmentItem" ("id", "investmentId", "propertyId", "note", "position")
SELECT 'favitem_' || p."id", 'favoritos_migrated', p."id", p."notes",
       (ROW_NUMBER() OVER (ORDER BY p."createdAt", p."id") - 1)::int
FROM "Property" p
WHERE p."favorite" = true OR p."notes" IS NOT NULL;
