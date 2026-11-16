-- CreateTable
CREATE TABLE "DuplicateDecision" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT,
    "status" "DuplicateStatus" NOT NULL,
    "level" "DuplicateLevel",
    "signals" JSONB NOT NULL,
    "sideA" JSONB NOT NULL,
    "sideB" JSONB NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateDecision_pkey" PRIMARY KEY ("id")
);
