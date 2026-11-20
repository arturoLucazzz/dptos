'use server';

/**
 * Server actions for investments: each calls the store, then refreshes the pages that show them.
 */

import { revalidatePath } from 'next/cache';
import type { InvestmentFilters } from '@/lib/investments/filters';
import * as store from '@/lib/investments/store';
import type { PickTarget } from '@/lib/investments/store';

function refresh(): void {
  revalidatePath('/');
  revalidatePath('/inversiones');
}

export async function listInvestments() {
  return store.listInvestments();
}

export async function getInvestment(id: string) {
  return store.getInvestment(id);
}

export async function lastOpenedInvestment() {
  return store.lastOpenedInvestment();
}

export async function createInvestment(name?: string) {
  const result = await store.createInvestment(name);
  refresh();
  return result;
}

export async function renameInvestment(id: string, name: string) {
  const result = await store.renameInvestment(id, name);
  refresh();
  return result;
}

export async function deleteInvestment(id: string) {
  const result = await store.deleteInvestment(id);
  refresh();
  return result;
}

export async function touchInvestment(id: string) {
  const result = await store.touchInvestment(id);
  refresh();
  return result;
}

export async function saveInvestmentFilters(id: string, filters: InvestmentFilters) {
  const result = await store.saveInvestmentFilters(id, filters);
  refresh();
  return result;
}

export async function addPick(id: string, target: PickTarget) {
  const result = await store.addPick(id, target);
  refresh();
  return result;
}

export async function removePick(itemId: string) {
  const result = await store.removePick(itemId);
  refresh();
  return result;
}

export async function setPickNote(itemId: string, note: string) {
  const result = await store.setPickNote(itemId, note);
  refresh();
  return result;
}
