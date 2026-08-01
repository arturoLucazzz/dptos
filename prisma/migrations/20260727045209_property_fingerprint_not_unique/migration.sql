-- DropIndex
DROP INDEX "Property_fingerprint_key";

-- CreateIndex
CREATE INDEX "Property_fingerprint_idx" ON "Property"("fingerprint");

-- CreateIndex
CREATE INDEX "Property_addressNorm_idx" ON "Property"("addressNorm");
