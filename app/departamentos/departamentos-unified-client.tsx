"use client";

import { useMemo, useState } from "react";
import { DashboardsSection } from "./dashboards-section";
import { DepartamentosTable } from "./departamentos-table";
import { AssumptionsFields } from "@/components/assumptions-panel";
import { Input } from "@/components/ui/input";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { useAssumptionsContext } from "@/components/assumptions-provider";
import type { FixedAssumptions } from "@/lib/assumption-defaults";
import type { ListingRow } from "@/lib/listing-row";
import { financeForListing } from "@/lib/listing-finance";

export interface DistrictOption {
  value: string;
  label: string;
}

interface DepartamentosUnifiedClientProps {
  listings: ListingRow[];
  districtOptions: DistrictOption[];
  fixedAssumptions: FixedAssumptions;
}

const GLOSSARY: { term: string; meaning: string }[] = [
  {
    term: "% cobertura",
    meaning: "% de la cuota (TCEA) que cubre el alquiler neto estimado. 100% = el alquiler paga la cuota sola.",
  },
  {
    term: "De bolsillo",
    meaning: "Lo que falta poner de tu bolsillo cada mes: cuota − alquiler neto.",
  },
  {
    term: "Cuota",
    meaning: "Pago mensual del préstamo con tus supuestos (precio, inicial %, TCEA, plazo).",
  },
  {
    term: "% vs precio justo",
    meaning: "Diferencia vs el precio que estima el modelo. Positivo = más barato que el modelo.",
  },
  {
    term: "% inicial necesario",
    meaning: "Enganche requerido para que el alquiler cubra el 100% de la cuota.",
  },
  {
    term: "Inicial / TEA / TCEA / Plazo",
    meaning: "Supuestos del panel: enganche, tasa del préstamo, tasa total con seguros/comisiones, y años del crédito.",
  },
];

export function DepartamentosUnifiedClient({
  listings,
  districtOptions,
  fixedAssumptions,
}: DepartamentosUnifiedClientProps) {
  const { panel } = useAssumptionsContext();
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [coverageMin, setCoverageMin] = useState<string>("");

  const multiSelectDistrictOptions: MultiSelectOption[] = useMemo(
    () => districtOptions.map((d) => ({ label: d.label, value: d.value })),
    [districtOptions]
  );

  const filtered = useMemo(() => {
    let list = listings;

    if (selectedDistricts.length > 0) {
      list = list.filter((r) => selectedDistricts.includes(r.districtSlug));
    }

    const min = priceMin ? Number(priceMin) : null;
    const max = priceMax ? Number(priceMax) : null;
    if (min != null && !Number.isNaN(min)) list = list.filter((r) => r.pricePen >= min);
    if (max != null && !Number.isNaN(max)) list = list.filter((r) => r.pricePen <= max);

    const minCoverage = coverageMin ? Number(coverageMin) : null;
    if (minCoverage != null && !Number.isNaN(minCoverage)) {
      list = list.filter((r) => {
        const finance = financeForListing(r, panel, fixedAssumptions);
        return finance != null && finance.coveragePct >= minCoverage;
      });
    }

    return list;
  }, [listings, selectedDistricts, priceMin, priceMax, coverageMin, panel, fixedAssumptions]);

  return (
    <div className="space-y-10">
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground">Distrito</label>
            <MultiSelect
              options={multiSelectDistrictOptions}
              onValueChange={setSelectedDistricts}
              placeholder="Seleccionar distritos"
              searchable={true}
              maxCount={3}
              variant="secondary"
              className="w-[280px]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground">Precio mín</label>
            <Input
              type="number"
              placeholder="Ej. 100000"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              className="h-9 w-32"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground">Precio máx</label>
            <Input
              type="number"
              placeholder="Ej. 800000"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              className="h-9 w-32"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground">% cobertura mín</label>
            <Input
              type="number"
              placeholder="Ej. 40"
              value={coverageMin}
              onChange={(e) => setCoverageMin(e.target.value)}
              className="h-9 w-28"
            />
          </div>
        </div>

        <AssumptionsFields />

        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground/80 hover:text-foreground">
            Glosario
          </summary>
          <ul className="mt-2 space-y-1.5 border-t pt-2">
            {GLOSSARY.map((item) => (
              <li key={item.term}>
                <span className="font-medium text-foreground/90">{item.term}</span>
                {" — "}
                {item.meaning}
              </li>
            ))}
          </ul>
        </details>
      </div>

      <DashboardsSection
        filtered={filtered}
        panel={panel}
        fixedAssumptions={fixedAssumptions}
      />
      <DepartamentosTable
        data={filtered}
        panel={panel}
        fixedAssumptions={fixedAssumptions}
      />
    </div>
  );
}
