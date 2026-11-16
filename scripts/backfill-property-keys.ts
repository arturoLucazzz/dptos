/**
 * Fills Property.streetNorm for properties created before the column existed.
 * streetNorm is addressNorm with the digit tokens removed, so the same street
 * matches across sources that write the house number differently.
 *
 * Idempotent: it only touches rows whose streetNorm is still empty, so a second
 * run updates nothing.
 */

import { prisma } from '../lib/db';
import { streetNorm } from '../lib/dedupe';

async function main() {
  const rows = await prisma.property.findMany({
    where: { streetNorm: null, addressNorm: { not: null } },
    select: { id: true, addressNorm: true },
  });

  let updated = 0;
  for (const row of rows) {
    const street = streetNorm(row.addressNorm);
    if (street === null) continue;
    // Raw SQL on purpose: prisma.update would bump Property.updatedAt, and this
    // backfill changes nothing the user edited.
    await prisma.$executeRaw`UPDATE "Property" SET "streetNorm" = ${street} WHERE id = ${row.id}`;
    updated += 1;
  }
  console.log(`Updated ${updated} properties.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
