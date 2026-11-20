import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ASSUMPTIONS_COOKIE, parseAssumptionsCookie } from '@/lib/assumptions-cookie';
import { parseRecoParams } from '@/lib/home-rows';
import { loadHomeRows, recommendHome } from '@/lib/home-universe';

export const dynamic = 'force-dynamic';

/** The first `n` recommendations for one tab: `?mode=gain&n=24`. */
export async function GET(request: Request) {
  try {
    const { mode, n } = parseRecoParams(new URL(request.url).searchParams);
    const panel = parseAssumptionsCookie((await cookies()).get(ASSUMPTIONS_COOKIE)?.value);
    return NextResponse.json(recommendHome(await loadHomeRows(panel), mode, n));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
