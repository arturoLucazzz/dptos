/*
  Warnings:

  - You are about to drop the column `complaintsDate` on the `DistrictStat` table. All the data in the column will be lost.
  - You are about to drop the column `complaintsPer10k` on the `DistrictStat` table. All the data in the column will be lost.
  - You are about to drop the column `complaintsSource` on the `DistrictStat` table. All the data in the column will be lost.
  - You are about to drop the column `incomeDate` on the `DistrictStat` table. All the data in the column will be lost.
  - You are about to drop the column `incomePerCapitaPen` on the `DistrictStat` table. All the data in the column will be lost.
  - You are about to drop the column `incomeSource` on the `DistrictStat` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DistrictStat" DROP COLUMN "complaintsDate",
DROP COLUMN "complaintsPer10k",
DROP COLUMN "complaintsSource",
DROP COLUMN "incomeDate",
DROP COLUMN "incomePerCapitaPen",
DROP COLUMN "incomeSource";
