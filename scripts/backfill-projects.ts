/**
 * Links PROJECT postings that have no project yet, the way ingest links a new
 * one: by source key, then by `sameProject`, else a new project. Postings
 * written before projects existed, or by an ingest that failed halfway, have
 * `projectId` null and so are missing from every project.
 *
 *   pnpm backfill:projects           # dry run: prints what would happen
 *   pnpm backfill:projects --apply   # writes
 *
 * Only `Posting.projectId` is set (and projects created or given a source key);
 * `propertyId` is left as it is. Idempotent: a second run finds nothing to do.
 *
 * The dry run decides each posting against the projects that exist now, so two
 * copies of one new project count as two new projects there; with --apply the
 * second copy finds the project the first one created.
 */

import { prisma } from '../lib/db';
import { PostingKind } from '../lib/generated/prisma/enums';
import { emptyCard, type ListingCard } from '../lib/listing-card';
import { isSourceId } from '../lib/official-price';
import { findProject, resolveProject } from '../scraper/src/db/resolve';

function numberOrNull(value: { toString(): string } | null | undefined): number | null {
  return value == null ? null : Number(value);
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? 'APPLY: writing changes.' : 'Dry run: nothing is written. Pass --apply to write.');

  const postings = await prisma.posting.findMany({
    where: { kind: PostingKind.PROJECT, projectId: null },
    orderBy: { firstSeenAt: 'asc' },
    select: {
      id: true,
      source: true,
      sourcePostingId: true,
      districtSlug: true,
      currentSnapshot: {
        select: {
          title: true,
          buildingName: true,
          developerName: true,
          address: true,
          latitude: true,
          longitude: true,
          deliveryDate: true,
          developmentStage: true,
        },
      },
    },
  });
  console.log(`${postings.length} PROJECT posting(s) without a project.`);

  const tally = { byKey: 0, match: 0, created: 0, skipped: 0 };
  for (const posting of postings) {
    const snapshot = posting.currentSnapshot;
    if (!snapshot || !isSourceId(posting.source)) {
      tally.skipped++;
      continue;
    }
    const card: ListingCard = emptyCard(posting.source, {
      kind: 'PROJECT',
      sourcePostingId: posting.sourcePostingId,
      districtSlug: posting.districtSlug,
      title: snapshot.title,
      buildingName: snapshot.buildingName,
      developerName: snapshot.developerName,
      address: snapshot.address,
      latitude: numberOrNull(snapshot.latitude),
      longitude: numberOrNull(snapshot.longitude),
      deliveryDate: snapshot.deliveryDate,
      developmentStage: snapshot.developmentStage,
    });

    const found = await findProject(card, posting.districtSlug);
    if (!found) {
      tally.skipped++;
      continue;
    }
    if (found.kind === 'by-key') tally.byKey++;
    else if (found.kind === 'match') tally.match++;
    else tally.created++;

    if (apply) {
      const projectId = await resolveProject(card, posting.districtSlug);
      if (projectId) await prisma.posting.update({ where: { id: posting.id }, data: { projectId } });
    }
  }

  const link = apply ? 'Linked' : 'Would link';
  console.log(`${link} by source key: ${tally.byKey}`);
  console.log(`${link} to a matching project, adding the source key: ${tally.match}`);
  console.log(`${apply ? 'Linked to a new project' : 'Would create a new project'}: ${tally.created}`);
  console.log(`Skipped (no snapshot or unknown source): ${tally.skipped}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
