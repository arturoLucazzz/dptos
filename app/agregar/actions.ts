'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { ingestCards, startRun, finishRun } from '../../scraper/src/db/ingest';
import { rawFromFormEntries, validateManualListing } from '@/lib/manual-listing';
import { ScrapeMode, ScrapeStatus } from '@/lib/generated/prisma/enums';

export type ManualResult = { ok: true } | { ok: false; errors: Record<string, string> };

/**
 * Validates a hand-typed listing and ingests it like a scraped card, in a MANUAL run
 * of its own. The run lists only `manual`, so it never moves a scraper's
 * possibly-sold cutoff or sanity-gate baseline.
 */
export async function createManualListing(raw: unknown): Promise<ManualResult> {
  const result = validateManualListing(raw, () => randomUUID());
  if (!result.ok) return result;

  const run = await startRun({ mode: ScrapeMode.MANUAL, gitSha: null, sources: ['manual'] });
  try {
    // One district and one operation for the whole entry, so one call, project card first.
    await ingestCards({
      runId: run.id,
      source: 'manual',
      districtSlug: result.districtSlug,
      operation: result.operation,
      cards: result.cards,
      observedAt: run.startedAt,
    });
  } catch (error) {
    console.error('manual listing ingest failed', error);
    await finishRun(run.id, {
      status: ScrapeStatus.FAILED,
      districtCounts: {},
      pagesFetched: 0,
      skippedDistricts: [],
      errors: { message: error instanceof Error ? error.message : String(error) },
    }).catch((finishError) => console.error('could not mark the manual run as failed', finishError));
    return { ok: false, errors: { form: 'No se pudo guardar. Intenta de nuevo.' } };
  }
  const count = result.cards.filter((card) => card.kind === 'UNIT').length;
  await finishRun(run.id, {
    status: ScrapeStatus.SUCCESS,
    districtCounts: { manual: { [result.districtSlug]: { [result.operation]: count } } },
    pagesFetched: 0,
    skippedDistricts: [],
    sources: ['manual'],
  });

  revalidateTag('sale-listings', { expire: 0 });
  revalidatePath('/departamentos');
  return { ok: true };
}

export type FormState = { result: ManualResult | null; values: Record<string, string> };

/** The `<form action>` wrapper: reads the fields, keeps what was typed when there are errors. */
export async function submitManualForm(_previous: FormState, formData: FormData): Promise<FormState> {
  const entries = [...formData.entries()].filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  const result = await createManualListing(rawFromFormEntries(entries));
  return { result, values: result.ok ? {} : Object.fromEntries(entries) };
}
