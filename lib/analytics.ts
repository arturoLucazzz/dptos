/**
 * Market analytics: where new supply is coming. Projects are not buy candidates;
 * they are an early warning that rent coverage in that district will get harder.
 */

import { districtName } from './district-name';
import { prisma } from './db';
import { Operation, PostingKind } from './generated/prisma/enums';
import { possiblySoldCutoffs } from './market';
import { livePostingWhere } from './possibly-sold';
import { collapseProjects } from './property-stats';

export interface ConstructionPipeline {
  districtSlug: string;
  districtName: string;
  enPlanos: number;
  enConstruccion: number;
  entregaInmediata: number;
  other: number;
  total: number;
  /** Sum of unitsCount when Urbania publishes it; otherwise project count. */
  unitsApprox: number;
}

function stageBucket(stage: string | null): keyof Pick<
  ConstructionPipeline,
  'enPlanos' | 'enConstruccion' | 'entregaInmediata' | 'other'
> {
  const s = (stage ?? '').toLowerCase();
  if (s.includes('plano')) return 'enPlanos';
  if (s.includes('construc')) return 'enConstruccion';
  if (s.includes('inmediata') || s.includes('entrega')) return 'entregaInmediata';
  return 'other';
}

/**
 * Projects under construction, by district and stage.
 *
 * These are not buy candidates — their price is a "desde". They are an early signal
 * that a district is about to absorb new units, which pressures rents and therefore
 * the coverage numbers of everything already bought there.
 */
export async function loadConstructionPipeline(): Promise<ConstructionPipeline[]> {
  const cutoffs = await possiblySoldCutoffs();

  const projects = await prisma.posting.findMany({
    where: {
      kind: PostingKind.PROJECT,
      operation: Operation.SALE,
      AND: [livePostingWhere(cutoffs)],
      currentSnapshot: { isNot: null },
    },
    select: {
      id: true,
      projectId: true,
      districtSlug: true,
      currentSnapshot: {
        select: { developmentStage: true, unitsCount: true },
      },
    },
  });

  // One Project on Proper and Nexo is one project, not two.
  const collapsed = collapseProjects(
    projects.flatMap((p) =>
      p.currentSnapshot
        ? [
            {
              postingId: p.id,
              projectId: p.projectId,
              districtSlug: p.districtSlug,
              developmentStage: p.currentSnapshot.developmentStage,
              unitsCount: p.currentSnapshot.unitsCount,
            },
          ]
        : []
    )
  );

  const byDistrict = new Map<string, ConstructionPipeline>();
  for (const project of collapsed) {
    const row =
      byDistrict.get(project.districtSlug) ??
      ({
        districtSlug: project.districtSlug,
        districtName: districtName(project.districtSlug),
        enPlanos: 0,
        enConstruccion: 0,
        entregaInmediata: 0,
        other: 0,
        total: 0,
        unitsApprox: 0,
      } satisfies ConstructionPipeline);
    const bucket = stageBucket(project.developmentStage);
    row[bucket] += 1;
    row.total += 1;
    row.unitsApprox += project.unitsCount && project.unitsCount > 0 ? project.unitsCount : 1;
    byDistrict.set(project.districtSlug, row);
  }

  return [...byDistrict.values()].sort((a, b) => b.unitsApprox - a.unitsApprox);
}
