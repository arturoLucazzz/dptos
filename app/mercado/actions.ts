'use server';

/**
 * Server action for saved headlines. No revalidatePath on purpose: the client keeps its own
 * state, and the page is force-dynamic, so the next visit reads fresh data.
 */

import { prisma } from '@/lib/db';

export async function toggleSavedNews(id: string): Promise<{ saved: boolean }> {
  // An action is a public endpoint: the browser can send anything.
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) throw new Error('Noticia inválida');
  const item = await prisma.newsItem.findUnique({ where: { id }, select: { saved: true } });
  if (!item) throw new Error('Noticia inválida');
  const saved = !item.saved;
  await prisma.newsItem.update({ where: { id }, data: { saved, savedAt: saved ? new Date() : null } });
  return { saved };
}
