'use server';

/**
 * Server actions for investments: each calls the store and nothing more.
 *
 * No revalidatePath here on purpose. A revalidation inside an action makes Next send back
 * a fresh render of the current page, and the workspace page is expensive (touch, cards,
 * picks). The list and the workspace keep their own state, and every page that shows
 * inversiones is force-dynamic, so the next navigation reads fresh data anyway.
 */

import { parseInvestmentFilters, parsePickTarget, type InvestmentFilters, type PickTarget } from '@/lib/investments/filters';
import * as store from '@/lib/investments/store';

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
  return store.createInvestment(name);
}

export async function renameInvestment(id: string, name: string) {
  return store.renameInvestment(id, name);
}

export async function deleteInvestment(id: string) {
  return store.deleteInvestment(id);
}

export async function touchInvestment(id: string) {
  return store.touchInvestment(id);
}

export async function saveInvestmentFilters(id: string, filters: InvestmentFilters) {
  // An action is a public endpoint: the browser can send anything.
  return store.saveInvestmentFilters(id, parseInvestmentFilters(filters));
}

export async function addPick(id: string, target: PickTarget) {
  const parsed = parsePickTarget(target);
  if (!parsed) throw new Error('Elegido inválido');
  return store.addPick(id, parsed);
}

export async function removePick(itemId: string) {
  return store.removePick(itemId);
}

export async function setPickNote(itemId: string, note: string) {
  return store.setPickNote(itemId, note);
}
