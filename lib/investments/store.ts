/**
 * Database access for investments and their picks. Server only.
 */

import { prisma } from '@/lib/db';
import type { InputJsonValue } from '@/lib/generated/prisma/internal/prismaNamespace';
import { normalizeName, normalizeNote, type InvestmentFilters } from './filters';

export type PickTarget = { propertyId: string } | { projectId: string };

const WITH_ITEMS = { items: { orderBy: { position: 'asc' as const } } };

export function listInvestments() {
  return prisma.investment.findMany({ orderBy: { lastOpenedAt: 'desc' }, include: WITH_ITEMS });
}

export function getInvestment(id: string) {
  return prisma.investment.findUnique({ where: { id }, include: WITH_ITEMS });
}

export function lastOpenedInvestment() {
  return prisma.investment.findFirst({ orderBy: { lastOpenedAt: 'desc' }, include: WITH_ITEMS });
}

export function createInvestment(name?: string) {
  return prisma.investment.create({ data: { name: normalizeName(name ?? '', 'Nueva inversión') } });
}

export async function renameInvestment(id: string, name: string) {
  const current = await prisma.investment.findUniqueOrThrow({ where: { id }, select: { name: true } });
  return prisma.investment.update({ where: { id }, data: { name: normalizeName(name, current.name) } });
}

export function deleteInvestment(id: string) {
  return prisma.investment.delete({ where: { id } });
}

export function touchInvestment(id: string) {
  return prisma.investment.update({ where: { id }, data: { lastOpenedAt: new Date() } });
}

export function saveInvestmentFilters(id: string, filters: InvestmentFilters) {
  return prisma.investment.update({ where: { id }, data: { filters: filters as unknown as InputJsonValue } });
}

/** Adds a pick once; a repeat returns the existing item. */
export async function addPick(id: string, target: PickTarget) {
  const where = { investmentId: id, ...('propertyId' in target ? { propertyId: target.propertyId } : { projectId: target.projectId }) };
  const existing = await prisma.investmentItem.findFirst({ where });
  if (existing) return existing;
  const last = await prisma.investmentItem.aggregate({ where: { investmentId: id }, _max: { position: true } });
  try {
    return await prisma.investmentItem.create({ data: { ...where, position: (last._max.position ?? -1) + 1 } });
  } catch (error) {
    // A parallel add won the unique constraint: return that item.
    const raced = await prisma.investmentItem.findFirst({ where });
    if (raced) return raced;
    throw error;
  }
}

export function removePick(itemId: string) {
  return prisma.investmentItem.delete({ where: { id: itemId } });
}

export function setPickNote(itemId: string, note: string) {
  return prisma.investmentItem.update({ where: { id: itemId }, data: { note: normalizeNote(note) } });
}
