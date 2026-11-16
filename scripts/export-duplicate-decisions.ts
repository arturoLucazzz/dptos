/**
 * Writes the owner's duplicate decisions as test fixtures, so the dedupe levels
 * can be tuned against real verdicts. `lib/dedupe.test.ts` reads the file.
 *
 *   tsx --env-file-if-exists=.env scripts/export-duplicate-decisions.ts   (from the repo root)
 *
 * Each pair is written as the two sides the matcher compares today, built the
 * same way ingest builds them, plus the status.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { prisma } from '../lib/db';
import { DuplicateStatus } from '../lib/generated/prisma/enums';
import { dedupePropertySelect, dedupeSideFromProperty } from '../lib/dedupe-side';
import type { DuplicateDecision } from '../lib/duplicates';

const OUTPUT = join(process.cwd(), 'lib', '__fixtures__', 'duplicate-decisions.json');

async function main() {
  const rows = await prisma.duplicateCandidate.findMany({
    where: { status: { in: [DuplicateStatus.CONFIRMED, DuplicateStatus.REJECTED] } },
    orderBy: { id: 'asc' },
    select: {
      status: true,
      propertyA: { select: dedupePropertySelect },
      propertyB: { select: dedupePropertySelect },
    },
  });

  const decisions: DuplicateDecision[] = rows.map((row) => ({
    status: row.status === DuplicateStatus.CONFIRMED ? 'CONFIRMED' : 'REJECTED',
    a: dedupeSideFromProperty(row.propertyA),
    b: dedupeSideFromProperty(row.propertyB),
  }));

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(decisions, null, 2)}\n`);
  const confirmed = decisions.filter((d) => d.status === 'CONFIRMED').length;
  console.log(`Wrote ${decisions.length} decisions (${confirmed} confirmed) to ${OUTPUT}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
