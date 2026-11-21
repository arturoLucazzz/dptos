'use client';

import { useActionState, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DEFAULT_RADIUS_M } from '@/lib/location/zone-input';
import { deleteZone, saveZone, type ZoneFormState } from './actions';

export interface ZoneView {
  id: string;
  name: string;
  kind: 'DISTRICT' | 'CIRCLE' | 'POLYGON';
  districtSlug: string | null;
  lat: number | null;
  lon: number | null;
  radiusM: number | null;
  /** POLYGON zones: the corners of the drawn area (the closing point not counted). */
  vertexCount: number | null;
  rating: number;
  notes: string | null;
}

function shapeLabel(z: ZoneView, districtName: Map<string, string>): string {
  if (z.kind === 'DISTRICT') return `Distrito: ${districtName.get(z.districtSlug ?? '') ?? z.districtSlug}`;
  if (z.kind === 'POLYGON') return `Área dibujada · ${z.vertexCount ?? 0} ${z.vertexCount === 1 ? 'punto' : 'puntos'}`;
  return `Punto ${z.lat}, ${z.lon} · radio ${z.radiusM} m`;
}

const INITIAL: ZoneFormState = { result: null, values: {} };
const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function valuesOf(zone: ZoneView | null): Record<string, string> {
  if (!zone) return { kind: 'CIRCLE' };
  return {
    id: zone.id,
    name: zone.name,
    kind: zone.kind,
    districtSlug: zone.districtSlug ?? '',
    coordinates: zone.lat != null && zone.lon != null ? `${zone.lat}, ${zone.lon}` : '',
    radiusM: zone.radiusM != null ? String(zone.radiusM) : '',
    rating: String(zone.rating),
    notes: zone.notes ?? '',
  };
}

function ZoneForm({
  initial,
  districts,
  districtsWithBoundary,
  onDone,
}: {
  initial: ZoneView | null;
  districts: { slug: string; name: string }[];
  districtsWithBoundary: string[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveZone, INITIAL);
  const values = state.result && !state.result.ok ? state.values : valuesOf(initial);
  const errors = state.result && !state.result.ok ? state.result.errors : {};
  const [kind, setKind] = useState(values.kind === 'DISTRICT' ? 'DISTRICT' : 'CIRCLE');
  // A drawn zone keeps its shape: only the name, rating, and note are edited here.
  const drawn = initial?.kind === 'POLYGON';
  const withBoundary = new Set(districtsWithBoundary);

  const error = (name: string) => errors[name] && <span className="block text-xs text-red-700">{errors[name]}</span>;

  return (
    <form action={action} className="space-y-3 rounded-lg border p-4">
      <h2 className="font-medium">{initial ? `Editar "${initial.name}"` : 'Nueva zona'}</h2>
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Nombre *</span>
        <Input name="name" defaultValue={values.name ?? ''} placeholder="Ej. Parque Castilla" />
        {error('name')}
      </label>
      {drawn ? (
        <>
          <input type="hidden" name="kind" value="POLYGON" />
          <p className="text-xs text-muted-foreground">Área dibujada en el mapa. Su forma no se edita aquí.</p>
        </>
      ) : (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Tipo</span>
          <select name="kind" className={SELECT_CLASS} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="CIRCLE">Punto y radio</option>
            <option value="DISTRICT">Distrito completo</option>
          </select>
        </label>
      )}
      {drawn ? null : kind === 'DISTRICT' ? (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Distrito *</span>
          <select name="districtSlug" className={SELECT_CLASS} defaultValue={values.districtSlug ?? ''}>
            <option value="">Elige un distrito</option>
            {districts.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name}
                {withBoundary.has(d.slug) ? '' : ' (sin límite: corre pnpm location:places)'}
              </option>
            ))}
          </select>
          {error('districtSlug')}
        </label>
      ) : (
        <>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Enlace de Google Maps o coordenadas *</span>
            <Input
              name="coordinates"
              defaultValue={values.coordinates ?? ''}
              placeholder="https://www.google.com/maps/…/@-12.0849,-77.0347,17z  o  -12.0849, -77.0347"
            />
            <span className="block text-xs text-muted-foreground">
              Los enlaces cortos (maps.app.goo.gl) no traen coordenadas: ábrelos y copia el enlace largo.
            </span>
            {error('coordinates')}
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Radio en metros</span>
            <Input name="radiusM" inputMode="numeric" defaultValue={values.radiusM ?? ''} placeholder={String(DEFAULT_RADIUS_M)} />
            {error('radiusM')}
          </label>
        </>
      )}
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Nota de 0 a 10 *</span>
        <Input name="rating" inputMode="numeric" defaultValue={values.rating ?? ''} placeholder="Ej. 9" />
        {error('rating')}
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Notas</span>
        <Input name="notes" defaultValue={values.notes ?? ''} placeholder="Ej. Calles tranquilas, mucho verde" />
      </label>
      {error('form')}
      {state.result?.ok && <p className="text-sm text-emerald-700">{state.result.message}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Guardando y recalculando…' : 'Guardar'}
        </Button>
        {initial && (
          <Button type="button" variant="outline" onClick={onDone}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

export function ZonasClient({
  zones,
  districts,
  districtsWithBoundary,
}: {
  zones: ZoneView[];
  districts: { slug: string; name: string }[];
  districtsWithBoundary: string[];
}) {
  const [editing, setEditing] = useState<ZoneView | null>(null);
  const [pending, startTransition] = useTransition();
  const districtName = new Map(districts.map((d) => [d.slug, d.name]));

  return (
    <div className="space-y-6">
      {zones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay zonas.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {zones.map((z) => (
            <li key={z.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="w-10 text-lg font-semibold tabular-nums">{z.rating}</span>
              <div className="min-w-48 flex-1">
                <div className="font-medium">{z.name}</div>
                <div className="text-xs text-muted-foreground">
                  {shapeLabel(z, districtName)}
                  {z.notes ? ` · ${z.notes}` : ''}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing(z)}>
                Editar
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => startTransition(() => deleteZone(z.id))}
              >
                Borrar
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ZoneForm
        key={editing?.id ?? 'new'}
        initial={editing}
        districts={districts}
        districtsWithBoundary={districtsWithBoundary}
        onDone={() => setEditing(null)}
      />
    </div>
  );
}
