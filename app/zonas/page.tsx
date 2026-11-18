import { prisma } from '@/lib/db';
import { LIMA_PROVINCE_DISTRICTS } from '@/lib/location/lima-districts';
import { ZonasClient, type ZoneView } from './zonas-client';

export const metadata = { title: 'Zonas' };
export const dynamic = 'force-dynamic';

export default async function ZonasPage() {
  const [zones, boundaries] = await Promise.all([
    prisma.zone.findMany({ orderBy: [{ rating: 'desc' }, { name: 'asc' }] }),
    prisma.$queryRaw<{ slug: string }[]>`SELECT slug FROM "DistrictStat" WHERE boundary IS NOT NULL`,
  ]);
  const view: ZoneView[] = zones.map((z) => ({
    id: z.id,
    name: z.name,
    kind: z.kind,
    districtSlug: z.districtSlug,
    lat: z.latitude == null ? null : Number(z.latitude),
    lon: z.longitude == null ? null : Number(z.longitude),
    radiusM: z.radiusM,
    rating: z.rating,
    notes: z.notes,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-4 py-6">
      <h1 className="text-2xl font-semibold">Zonas</h1>
      <p className="text-sm text-muted-foreground">
        Marca las zonas que conoces y ponles nota de 0 a 10. Un departamento dentro de una zona toma el 60% de su
        calidad de zona de tu nota; cerca de la zona, menos, hasta 500 m del borde. Una zona mala (por ejemplo una vía
        ruidosa con nota 2) baja el puntaje de lo que tiene al lado.
      </p>
      <ZonasClient zones={view} districts={[...LIMA_PROVINCE_DISTRICTS]} districtsWithBoundary={boundaries.map((b) => b.slug)} />
    </div>
  );
}
