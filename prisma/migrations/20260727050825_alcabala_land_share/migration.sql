/*
  Warnings:

  - Added the required column `alcabalaFirstSaleLandSharePct` to the `Assumptions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Assumptions" ADD COLUMN     "alcabalaFirstSaleLandSharePct" DECIMAL(5,2) NOT NULL;
