import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ASSUMPTIONS_COOKIE, parseAssumptionsCookie } from '@/lib/assumptions-cookie';
import { parseRecoParams } from '@/lib/home-rows';
import { loadHomeFilters } from '@/lib/home-filters';
import { filterHomeRows, loadHomeRows, recommendHome } from '@/lib/home-universe';

export const dynamic = 'force-dynamic';

/** The first `n` recommendations for one tab, with the Inicio filters: `?orden=gain&n=24&dorm_min=2`. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { mode, n } = parseRecoParams(url.searchParams);
    const panel = parseAssumptionsCookie((await cookies()).get(ASSUMPTIONS_COOKIE)?.value);
    const rows = filterHomeRows(await loadHomeRows(panel), loadHomeFilters(url.searchParams));
    return NextResponse.json(recommendHome(rows, mode, n));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
