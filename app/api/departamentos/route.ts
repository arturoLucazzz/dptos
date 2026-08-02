import { NextResponse } from 'next/server';
import {
  parseDepartamentosSearchParams,
  queryDepartamentos,
} from '@/lib/departamentos-query';
import { getCachedSaleListings } from '@/lib/listings';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = parseDepartamentosSearchParams(url.searchParams);
    const universe = await getCachedSaleListings();
    const result = queryDepartamentos(universe.listings, universe.fixedAssumptions, input);

    return NextResponse.json({
      ...result,
      scrapedAt: universe.scrapedAt,
      districtOptions: universe.districtOptions,
      fixedAssumptions: universe.fixedAssumptions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
