/**
 * Writes the owner's duplicate decisions as test fixtures, so the dedupe levels
 * can be tuned against real verdicts. `lib/dedupe.test.ts` reads the file.
 *
 *   tsx --env-file-if-exists=.env scripts/export-duplicate-decisions.ts   (from the repo root)
 *
 * Each pair is written as the two sides the matcher saw when the owner decided
 * (stored in DuplicateDecision, since a confirm deletes one property), plus the
 * status.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { prisma } from '../lib/db';
import { DuplicateStatus } from '../lib/generated/prisma/enums';
import type { DedupeSide } from '../lib/dedupe';
import type { DuplicateDecision } from '../lib/duplicates';

const OUTPUT = join(process.cwd(), 'lib', '__fixtures__', 'duplicate-decisions.json');

/** Sides stored before the unit and project lists had one `unitNumber`. */
function currentSide(stored: unknown): DedupeSide {
  const side = stored as DedupeSide & { unitNumber?: string | null };
  const { unitNumber, ...rest } = side;
  return {
    ...rest,
    unitNumbers: Array.isArray(side.unitNumbers) ? side.unitNumbers : unitNumber ? [unitNumber] : [],
    projectIds: Array.isArray(side.projectIds) ? side.projectIds : [],
  };
}

async function main() {
  const rows = await prisma.duplicateDecision.findMany({
    where: { status: { in: [DuplicateStatus.CONFIRMED, DuplicateStatus.REJECTED] } },
    orderBy: [{ decidedAt: 'asc' }, { id: 'asc' }],
    select: { status: true, sideA: true, sideB: true },
  });

  const decisions: DuplicateDecision[] = rows.map((row) => ({
    status: row.status === DuplicateStatus.CONFIRMED ? 'CONFIRMED' : 'REJECTED',
    a: currentSide(row.sideA),
    b: currentSide(row.sideB),
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
