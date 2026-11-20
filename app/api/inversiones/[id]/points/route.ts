import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ASSUMPTIONS_COOKIE, parseAssumptionsCookie } from '@/lib/assumptions-cookie';
import { parseInvestmentFilters } from '@/lib/investments/filters';
import { getInvestment } from '@/lib/investments/store';
import { loadPoints } from '@/lib/investments/workspace-data';

export const dynamic = 'force-dynamic';

/**
 * Every row that matches `{ filters }` and has coordinates, as `[id, lon, lat, gainPen]`
 * tuples for the map: postingId for units, projectId for projects. Nothing is saved.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { filters?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }
  const filters = parseInvestmentFilters(body?.filters);
  try {
    const panel = parseAssumptionsCookie((await cookies()).get(ASSUMPTIONS_COOKIE)?.value);
    const [investment, points] = await Promise.all([getInvestment(id), loadPoints(filters, panel)]);
    if (!investment) return NextResponse.json({ error: 'Esta inversión no existe' }, { status: 404 });
    return NextResponse.json({ points });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
