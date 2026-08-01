/**
 * Seed. Idempotent, so it is safe to run against a database with real data in it.
 *
 * Right now it only writes the assumptions row. The synthetic market used for
 * testing the analytics is added separately, behind a flag, so that running the
 * seed by reflex cannot inject fake listings into real data.
 */

import { ensureAssumptions } from '../lib/assumptions';
import { prisma } from '../lib/db';

async function main() {
  await ensureAssumptions();
  const assumptions = await prisma.assumptions.findUnique({ where: { id: 'default' } });
  console.log(`Assumptions ready: UIT S/ ${assumptions?.uit}, TCEA ${assumptions?.tcea}%.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
