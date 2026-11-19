-- CreateTable
CREATE TABLE "Statistic" (
    "id" TEXT NOT NULL,
    "place" TEXT NOT NULL,
    "indicator" TEXT NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "period" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "loadedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Statistic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Statistic_indicator_idx" ON "Statistic"("indicator");

-- CreateIndex
CREATE UNIQUE INDEX "Statistic_place_indicator_period_key" ON "Statistic"("place", "indicator", "period");
