import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ASSUMPTIONS_COOKIE, parseAssumptionsCookie } from '@/lib/assumptions-cookie';
import { parseInvestmentFilters } from '@/lib/investments/filters';
import { getInvestment, saveInvestmentFilters } from '@/lib/investments/store';
import { CARD_IDS_MAX, loadCards, loadCardsByIds } from '@/lib/investments/workspace-data';

export const dynamic = 'force-dynamic';

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2025';
}

/**
 * One page of cards for `{ filters, page }`; the filters are saved to the inversión.
 * With `ids` (postingIds or projectIds, by the filters' kind), the cards for those ids,
 * with no paging and no save: the map popup uses it for a pin not on the loaded pages.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { filters?: unknown; page?: unknown; ids?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }
  const filters = parseInvestmentFilters(body?.filters);
  const rawPage = Number(body?.page);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.round(rawPage) : 1;

  const ids = Array.isArray(body?.ids) ? body.ids.filter((v): v is string => typeof v === 'string').slice(0, CARD_IDS_MAX) : null;

  try {
    const panel = parseAssumptionsCookie((await cookies()).get(ASSUMPTIONS_COOKIE)?.value);
    if (ids) {
      const [investment, cards] = await Promise.all([getInvestment(id), loadCardsByIds(filters, panel, ids)]);
      if (!investment) return NextResponse.json({ error: 'Esta inversión no existe' }, { status: 404 });
      return NextResponse.json(cards);
    }
    // The save fails with P2025 for an unknown id, which is the 404.
    const [, cards] = await Promise.all([saveInvestmentFilters(id, filters), loadCards(filters, panel, page)]);
    return NextResponse.json(cards);
  } catch (error) {
    if (isNotFound(error)) return NextResponse.json({ error: 'Esta inversión no existe' }, { status: 404 });
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
