/**
 * Fills Property.streetNorm for properties created before the column existed.
 * streetNorm is addressNorm with the digit tokens removed, so the same street
 * matches across sources that write the house number differently.
 *
 * Idempotent: it only touches rows whose streetNorm is still empty, so a second
 * run updates nothing.
 */

import { prisma } from '../lib/db';

export function streetFromAddressNorm(addressNorm: string): string {
  return addressNorm
    .split(/\s+/)
    .filter((token) => token !== '' && !/\d/.test(token))
    .join(' ');
}

async function main() {
  const rows = await prisma.property.findMany({
    where: { streetNorm: null, addressNorm: { not: null } },
    select: { id: true, addressNorm: true },
  });

  let updated = 0;
  for (const row of rows) {
    const streetNorm = streetFromAddressNorm(row.addressNorm ?? '');
    if (streetNorm === '') continue;
    await prisma.property.update({ where: { id: row.id }, data: { streetNorm } });
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
