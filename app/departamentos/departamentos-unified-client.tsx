"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryStates } from "nuqs";
import useSWR from "swr";
import { DashboardsSection } from "./dashboards-section";
import { DepartamentosTable } from "./departamentos-table";
import {
  AssumptionsFields,
  type PanelDraftStrings,
} from "@/components/assumptions-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { DEFAULT_PANEL, type FixedAssumptions, type PanelAssumptions } from "@/lib/assumption-defaults";
import type {
  DepartamentosQueryResult,
  DepartamentosSortId,
  DepartamentosStats,
} from "@/lib/departamentos-query";
import {
  departamentosApiQuery,
  departamentosSearchParams,
} from "@/lib/departamentos-search-params";
import { assumptionWarnings } from "@/lib/finance";
import { SOURCE_IDS, SOURCE_LABELS } from "@/lib/listing-card";
import { isSourceId } from "@/lib/official-price";
import { parseNumericInput, sanitizeNumericInput } from "@/lib/numeric-input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const SOURCE_OPTIONS: MultiSelectOption[] = SOURCE_IDS.map((id) => ({ label: SOURCE_LABELS[id], value: id }));

interface DistrictOption {
  value: string;
  label: string;
}

interface ApiResponse extends DepartamentosQueryResult {
  scrapedAt: string | null;
  districtOptions: DistrictOption[];
  fixedAssumptions: FixedAssumptions;
  error?: string;
}

async function fetchDepartamentos(url: string): Promise<ApiResponse> {
  const res = await fetch(url);
  const json = (await res.json()) as ApiResponse;
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

type DraftFilters = {
  districts: string[];
  priceMin: string;
  priceMax: string;
  bedroomsMin: string;
  bedroomsMax: string;
  coverageMin: string;
  panel: PanelDraftStrings;
};

function optionalNumberString(n: number | null): string {
  return n == null ? "" : String(n);
}

function panelToStrings(panel: PanelAssumptions): PanelDraftStrings {
  return {
    downPaymentPct: String(panel.downPaymentPct),
    tea: String(panel.tea),
    tcea: String(panel.tcea),
    termYears: String(panel.termYears),
  };
}

function parsePanelDraft(panel: PanelDraftStrings): PanelAssumptions {
  return {
    downPaymentPct:
      parseNumericInput(panel.downPaymentPct) ?? DEFAULT_PANEL.downPaymentPct,
    tea: parseNumericInput(panel.tea) ?? DEFAULT_PANEL.tea,
    tcea: parseNumericInput(panel.tcea) ?? DEFAULT_PANEL.tcea,
    termYears: Math.round(parseNumericInput(panel.termYears) ?? DEFAULT_PANEL.termYears),
  };
}

function draftEqualsUrl(a: DraftFilters, b: DraftFilters): boolean {
  return (
    JSON.stringify(a.districts) === JSON.stringify(b.districts) &&
    a.priceMin === b.priceMin &&
    a.priceMax === b.priceMax &&
    a.bedroomsMin === b.bedroomsMin &&
    a.bedroomsMax === b.bedroomsMax &&
    a.coverageMin === b.coverageMin &&
    a.panel.downPaymentPct === b.panel.downPaymentPct &&
    a.panel.tea === b.panel.tea &&
    a.panel.tcea === b.panel.tcea &&
    a.panel.termYears === b.panel.termYears
  );
}

export function DepartamentosUnifiedClient() {
  const [urlState, setUrlState] = useQueryStates(departamentosSearchParams, {
    history: "replace",
    shallow: true,
  });

  const [draft, setDraft] = useState<DraftFilters>(() => ({
    districts: urlState.districts,
    priceMin: optionalNumberString(urlState.priceMin),
    priceMax: optionalNumberString(urlState.priceMax),
    bedroomsMin: optionalNumberString(urlState.bedroomsMin),
    bedroomsMax: optionalNumberString(urlState.bedroomsMax),
    coverageMin: optionalNumberString(urlState.coverageMin),
    panel: panelToStrings({
      downPaymentPct: urlState.inicial,
      tea: urlState.tea,
      tcea: urlState.tcea,
      termYears: urlState.plazo,
    }),
  }));

  // Sync draft from URL on back/forward (URL is an external system here).
  useEffect(() => {
    const next: DraftFilters = {
      districts: urlState.districts,
      priceMin: optionalNumberString(urlState.priceMin),
      priceMax: optionalNumberString(urlState.priceMax),
      bedroomsMin: optionalNumberString(urlState.bedroomsMin),
      bedroomsMax: optionalNumberString(urlState.bedroomsMax),
      coverageMin: optionalNumberString(urlState.coverageMin),
      panel: panelToStrings({
        downPaymentPct: urlState.inicial,
        tea: urlState.tea,
        tcea: urlState.tcea,
        termYears: urlState.plazo,
      }),
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from URL navigation
    setDraft((prev) => (draftEqualsUrl(prev, next) ? prev : next));
  }, [
    urlState.districts,
    urlState.priceMin,
    urlState.priceMax,
    urlState.bedroomsMin,
    urlState.bedroomsMax,
    urlState.coverageMin,
    urlState.inicial,
    urlState.tea,
    urlState.tcea,
    urlState.plazo,
  ]);

  const debouncedDraft = useDebouncedValue(draft, 300);
  const urlStateRef = useRef(urlState);
  useEffect(() => {
    urlStateRef.current = urlState;
  }, [urlState]);

  // Push debounced draft → URL (resets page when filters/hipoteca change).
  useEffect(() => {
    const current = urlStateRef.current;
    const next = {
      districts: debouncedDraft.districts,
      priceMin: parseNumericInput(debouncedDraft.priceMin),
      priceMax: parseNumericInput(debouncedDraft.priceMax),
      bedroomsMin: parseNumericInput(debouncedDraft.bedroomsMin),
      bedroomsMax: parseNumericInput(debouncedDraft.bedroomsMax),
      coverageMin: parseNumericInput(debouncedDraft.coverageMin),
      // Keep previous URL value while the field is empty / mid-edit (e.g. "0.").
      inicial:
        parseNumericInput(debouncedDraft.panel.downPaymentPct) ?? current.inicial,
      tea: parseNumericInput(debouncedDraft.panel.tea) ?? current.tea,
      tcea: parseNumericInput(debouncedDraft.panel.tcea) ?? current.tcea,
      plazo:
        parseNumericInput(debouncedDraft.panel.termYears) != null
          ? Math.round(parseNumericInput(debouncedDraft.panel.termYears)!)
          : current.plazo,
    };

    const filtersChanged =
      JSON.stringify(next.districts) !== JSON.stringify(current.districts) ||
      next.priceMin !== current.priceMin ||
      next.priceMax !== current.priceMax ||
      next.bedroomsMin !== current.bedroomsMin ||
      next.bedroomsMax !== current.bedroomsMax ||
      next.coverageMin !== current.coverageMin ||
      next.inicial !== current.inicial ||
      next.tea !== current.tea ||
      next.tcea !== current.tcea ||
      next.plazo !== current.plazo;

    if (!filtersChanged) return;

    void setUrlState({ ...next, page: 1 });
  }, [debouncedDraft, setUrlState]);

  const apiQuery = useMemo(
    () =>
      departamentosApiQuery({
        districts: urlState.districts,
        fuentes: urlState.fuentes,
        priceMin: urlState.priceMin,
        priceMax: urlState.priceMax,
        bedroomsMin: urlState.bedroomsMin,
        bedroomsMax: urlState.bedroomsMax,
        coverageMin: urlState.coverageMin,
        inicial: urlState.inicial,
        tea: urlState.tea,
        tcea: urlState.tcea,
        plazo: urlState.plazo,
        sort: urlState.sort,
        order: urlState.order,
        page: urlState.page,
      }),
    [urlState]
  );

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/departamentos?${apiQuery}`,
    fetchDepartamentos,
    { keepPreviousData: true, revalidateOnFocus: false }
  );

  const districtOptions: MultiSelectOption[] = useMemo(
    () => (data?.districtOptions ?? []).map((d) => ({ label: d.label, value: d.value })),
    [data?.districtOptions]
  );

  const warnings = useMemo(
    () =>
      assumptionWarnings({
        ...parsePanelDraft(draft.panel),
        vacancyMonthsPerYear: 1,
        rentGrowthPct: 3,
        rentIncomeTaxPct: 5,
      }),
    [draft.panel]
  );

  const setPanelField = useCallback(
    <K extends keyof PanelAssumptions>(key: K, value: string) => {
      setDraft((prev) => ({ ...prev, panel: { ...prev.panel, [key]: value } }));
    },
    []
  );

  const resetPanel = useCallback(() => {
    setDraft((prev) => ({ ...prev, panel: panelToStrings(DEFAULT_PANEL) }));
  }, []);

  const onSortChange = useCallback(
    (sort: DepartamentosSortId) => {
      if (urlState.sort === sort) {
        void setUrlState({ order: urlState.order === "desc" ? "asc" : "desc", page: 1 });
      } else {
        void setUrlState({ sort, order: "desc", page: 1 });
      }
    },
    [setUrlState, urlState.order, urlState.sort]
  );

  // The source filter goes straight to the URL: there is nothing to type, so no debounce.
  const onSourcesChange = useCallback(
    (values: string[]) => {
      void setUrlState({ fuentes: values.filter(isSourceId), page: 1 });
    },
    [setUrlState]
  );

  const onReviewed = useCallback(() => {
    void mutate();
  }, [mutate]);

  const onPageChange = useCallback(
    (page: number) => {
      void setUrlState({ page });
    },
    [setUrlState]
  );

  const stats: DepartamentosStats | null = data?.stats ?? null;
  const scrapedAt = data?.scrapedAt ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Departamentos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {stats ? `${stats.total.toLocaleString("es-PE")} avisos filtrados` : "Cargando…"}
          {scrapedAt ? ` · actualizado ${new Date(scrapedAt).toLocaleString("es-PE")}` : ""}
        </p>
        {error && (
          <p className="mt-2 text-sm text-red-700">
            {error instanceof Error ? error.message : String(error)}
          </p>
        )}
      </div>

      <DashboardsSection stats={stats} isValidating={isValidating && !isLoading} />

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3 text-center">
            <CardTitle className="text-lg">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end justify-center gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">Distrito</label>
                <MultiSelect
                  options={districtOptions}
                  defaultValue={draft.districts}
                  onValueChange={(districts) => setDraft((prev) => ({ ...prev, districts }))}
                  placeholder="Seleccionar distritos"
                  searchable={true}
                  maxCount={3}
                  variant="secondary"
                  className="h-11 min-w-70"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-muted-foreground">Fuente</label>
                <MultiSelect
                  options={SOURCE_OPTIONS}
                  defaultValue={urlState.fuentes}
                  onValueChange={onSourcesChange}
                  placeholder="Todas las fuentes"
                  maxCount={3}
                  variant="secondary"
                  className="h-11 min-w-56"
                />
              </div>

              {(
                [
                  ["priceMin", "Precio mín", "Ej. 100000", false],
                  ["priceMax", "Precio máx", "Ej. 800000", false],
                  ["bedroomsMin", "Cuartos mín", "Ej. 2", false],
                  ["bedroomsMax", "Cuartos máx", "Ej. 4", false],
                  ["coverageMin", "% cobertura mín", "Ej. 40", true],
                ] as const
              ).map(([key, label, placeholder, allowDecimal]) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-muted-foreground">{label}</label>
                  <Input
                    type="text"
                    inputMode={allowDecimal ? "decimal" : "numeric"}
                    placeholder={placeholder}
                    value={draft[key]}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        [key]: sanitizeNumericInput(e.target.value, { allowDecimal }),
                      }))
                    }
                    className="h-11 w-36 text-center text-base"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 text-center">
            <CardTitle className="text-lg">Hipoteca</CardTitle>
          </CardHeader>
          <CardContent>
            <AssumptionsFields
              panel={draft.panel}
              setField={setPanelField}
              reset={resetPanel}
              warnings={warnings}
              prominent
            />
          </CardContent>
        </Card>
      </div>

      {isLoading && !data ? (
        <p className="text-sm text-muted-foreground">Cargando avisos…</p>
      ) : (
        <DepartamentosTable
          data={data?.rows ?? []}
          total={data?.total ?? 0}
          page={data?.page ?? urlState.page}
          pageSize={data?.pageSize ?? 50}
          sort={urlState.sort}
          order={urlState.order}
          isValidating={isValidating && !isLoading}
          onSortChange={onSortChange}
          onPageChange={onPageChange}
          onReviewed={onReviewed}
        />
      )}
    </div>
  );
}
