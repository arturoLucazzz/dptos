/**
 * Moves rows filed under an old district slug to the slug the app uses now.
 *
 * The daily job used to ask for "magdalena-del-mar", while the app, the
 * sanity gate and the possibly-sold cutoff only know "magdalena". Postings,
 * properties (and their fingerprint, which starts with the district) and
 * projects are moved. Run history (`ScrapeRun.districtCounts`) is left as it
 * was observed.
 *
 *   pnpm relabel:districts           # dry run: prints what would move
 *   pnpm relabel:districts --apply   # writes, in one transaction
 *
 * Idempotent: a second run finds nothing to move. Properties are not merged
 * with existing "magdalena" ones; the duplicate review handles that.
 */

import { prisma } from '../lib/db';

const RELABELS: { from: string; to: string }[] = [{ from: 'magdalena-del-mar', to: 'magdalena' }];

async function counts(from: string) {
  const [postings, properties, projects] = await Promise.all([
    prisma.posting.count({ where: { districtSlug: from } }),
    prisma.property.count({ where: { districtSlug: from } }),
    prisma.project.count({ where: { districtSlug: from } }),
  ]);
  return { postings, properties, projects };
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? 'APPLY: writing changes.' : 'Dry run: nothing is written. Pass --apply to write.');

  for (const { from, to } of RELABELS) {
    const found = await counts(from);
    console.log(
      `${from} -> ${to}: ${found.postings} posting(s), ${found.properties} propert(ies), ${found.projects} project(s)`
    );
    if (!apply || found.postings + found.properties + found.projects === 0) continue;

    // Raw SQL so Property.updatedAt, which tracks the owner's edits, is not bumped.
    const prefix = `${from}|`;
    await prisma.$transaction([
      prisma.$executeRaw`UPDATE "Posting" SET "districtSlug" = ${to} WHERE "districtSlug" = ${from}`,
      prisma.$executeRaw`
        UPDATE "Property"
        SET "districtSlug" = ${to},
            "fingerprint" = CASE
              WHEN starts_with("fingerprint", ${prefix}) THEN ${`${to}|`} || substr("fingerprint", ${prefix.length + 1})
              ELSE "fingerprint"
            END
        WHERE "districtSlug" = ${from}`,
      prisma.$executeRaw`UPDATE "Project" SET "districtSlug" = ${to} WHERE "districtSlug" = ${from}`,
    ]);
    const left = await counts(from);
    console.log(`  moved; left under ${from}: ${left.postings + left.properties + left.projects} row(s)`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
