'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LIMA_DISTRICT_NAMES, LIMA_DISTRICT_SLUGS } from '../../scraper/src/config/districts';
import { submitManualForm, type FormState } from './actions';

const INITIAL: FormState = { result: null, values: {} };
const DISTRICTS = LIMA_DISTRICT_SLUGS.map((slug) => LIMA_DISTRICT_NAMES[slug]);
const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface FieldProps {
  name: string;
  label: string;
  state: FormState;
  required?: boolean;
  type?: string;
  placeholder?: string;
  inputMode?: 'decimal' | 'numeric';
}

function errorsOf(state: FormState): Record<string, string> {
  return state.result && !state.result.ok ? state.result.errors : {};
}

function Field({ name, label, state, required, type = 'text', placeholder, inputMode }: FieldProps) {
  const error = errorsOf(state)[name];
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">
        {label}
        {required && ' *'}
      </span>
      <Input
        name={name}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        defaultValue={state.values[name] ?? ''}
        aria-invalid={error ? true : undefined}
      />
      {error && <span className="block text-xs text-red-700">{error}</span>}
    </label>
  );
}

function Choice({
  name,
  label,
  state,
  required,
  options,
}: {
  name: string;
  label: string;
  state: FormState;
  required?: boolean;
  options: { value: string; label: string }[];
}) {
  const error = errorsOf(state)[name];
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">
        {label}
        {required && ' *'}
      </span>
      <select name={name} className={SELECT_CLASS} defaultValue={state.values[name] ?? ''}>
        <option value="">Elegir…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <span className="block text-xs text-red-700">{error}</span>}
    </label>
  );
}

const CURRENCIES = [
  { value: 'USD', label: 'Dólares (US$)' },
  { value: 'PEN', label: 'Soles (S/)' },
];
const DISTRICT_OPTIONS = DISTRICTS.map((name) => ({ value: name, label: name }));

function UnitFields({ state, prefix, projectMode }: { state: FormState; prefix: string; projectMode: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field name={`${prefix}price`} label="Precio" state={state} required inputMode="decimal" placeholder="280000" />
      <Choice name={`${prefix}currency`} label="Moneda" state={state} required options={CURRENCIES} />
      <Field name={`${prefix}bedrooms`} label="Dormitorios" state={state} required inputMode="numeric" />
      <Field name={`${prefix}area`} label="Área (m²)" state={state} required inputMode="decimal" />
      <Field name={`${prefix}bathrooms`} label="Baños" state={state} inputMode="numeric" />
      <Field name={`${prefix}parkingSpots`} label="Cocheras" state={state} inputMode="numeric" />
      {projectMode && <Field name={`${prefix}unitNumber`} label="Número de unidad" state={state} />}
    </div>
  );
}

export function AgregarForm() {
  const [state, action, pending] = useActionState(submitManualForm, INITIAL);
  const [mode, setMode] = useState<'unit' | 'project'>('unit');
  const [unitCount, setUnitCount] = useState(1);
  const errors = errorsOf(state);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="mode" value={mode} />

      <div role="group" aria-label="Tipo de aviso" className="inline-flex rounded-md border p-0.5">
        {(['unit', 'project'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            className={`cursor-pointer rounded px-3 py-1 text-sm ${mode === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            onClick={() => setMode(value)}
          >
            {value === 'unit' ? 'Unidad' : 'Proyecto'}
          </button>
        ))}
      </div>

      {errors.form && (
        <p role="alert" className="rounded-md border border-red-600 bg-red-50 p-3 text-sm text-red-900">
          {errors.form}
        </p>
      )}

      {state.result?.ok && (
        <p role="status" className="rounded-md border border-green-600 bg-green-50 p-3 text-sm text-green-900">
          Aviso agregado.{' '}
          <Link href="/departamentos" className="underline">
            Ver en departamentos
          </Link>
        </p>
      )}

      <div hidden={mode !== 'unit'}>
        <div className="space-y-3">
          <UnitFields state={state} prefix="" projectMode={false} />
          <div className="grid grid-cols-2 gap-3">
            <Choice
              name="operation"
              label="Operación"
              state={state}
              required
              options={[
                { value: 'SALE', label: 'Venta' },
                { value: 'RENT', label: 'Alquiler' },
              ]}
            />
            <Choice name="district" label="Distrito" state={state} required options={DISTRICT_OPTIONS} />
            <Field name="address" label="Dirección" state={state} />
            <Field name="buildingName" label="Nombre del edificio" state={state} />
            <Field name="unitNumber" label="Número de unidad" state={state} />
            <Field name="publisher" label="Quién publica" state={state} />
          </div>
          <Field name="link" label="Enlace del aviso" state={state} type="text" placeholder="https://" />
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Fotos (una URL por línea)</span>
            <textarea name="photoUrls" rows={3} className={SELECT_CLASS + ' h-auto'} defaultValue={state.values.photoUrls ?? ''} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Notas</span>
            <textarea name="notes" rows={3} className={SELECT_CLASS + ' h-auto'} defaultValue={state.values.notes ?? ''} />
          </label>
        </div>
      </div>
      <div hidden={mode !== 'project'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field name="project.name" label="Nombre del proyecto" state={state} required />
            <Choice name="project.district" label="Distrito" state={state} required options={DISTRICT_OPTIONS} />
            <Field name="project.developer" label="Inmobiliaria" state={state} />
            <Field name="project.address" label="Dirección" state={state} />
            <Field name="project.deliveryDate" label="Fecha de entrega" state={state} placeholder="2027-06" />
            <Field name="project.stage" label="Etapa" state={state} placeholder="En construcción" />
          </div>
          <Field name="project.link" label="Enlace del proyecto" state={state} type="text" placeholder="https://" />
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Notas</span>
            <textarea name="project.notes" rows={3} className={SELECT_CLASS + ' h-auto'} defaultValue={state.values['project.notes'] ?? ''} />
          </label>

          {Array.from({ length: unitCount }, (_, i) => (
            <fieldset key={i} className="space-y-2 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">Unidad {i + 1}</legend>
              <UnitFields state={state} prefix={`units.${i}.`} projectMode />
            </fieldset>
          ))}
          {errors.units && <p className="text-xs text-red-700">{errors.units}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setUnitCount((n) => n + 1)}>
              Agregar otra unidad
            </Button>
            {unitCount > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setUnitCount((n) => n - 1)}>
                Quitar la última
              </Button>
            )}
          </div>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Guardando…' : 'Guardar aviso'}
      </Button>
    </form>
  );
}
