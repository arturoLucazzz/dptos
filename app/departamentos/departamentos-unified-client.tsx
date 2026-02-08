"use client";

import { useMemo, useState } from "react";
import { DashboardsSection } from "./dashboards-section";
import { DepartamentosTable } from "./departamentos-table";
import type { ApartmentData } from "@/app/lib/types";

export interface DistrictOption {
  value: string;
  label: string;
}

interface DepartamentosUnifiedClientProps {
  apartments: ApartmentData[];
  districtOptions: DistrictOption[];
}

export function DepartamentosUnifiedClient({ apartments, districtOptions }: DepartamentosUnifiedClientProps) {
  const [districtFilter, setDistrictFilter] = useState<string>("all");
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    let list = [...apartments];
    if (districtFilter !== "all") {
      list = list.filter((r) => r.limaDistrictSlug === districtFilter);
    }
    const min = priceMin ? Number(priceMin) : null;
    const max = priceMax ? Number(priceMax) : null;
    if (min != null && !Number.isNaN(min)) list = list.filter((r) => r.price != null && r.price >= min);
    if (max != null && !Number.isNaN(max)) list = list.filter((r) => r.price != null && r.price <= max);
    if (stageFilter !== "all") {
      list = list.filter((r) => (r.developmentStage ?? "") === stageFilter);
    }
    return list;
  }, [apartments, districtFilter, priceMin, priceMax, stageFilter]);

  const allDistrictOptions = useMemo(
    () => [{ value: "all", label: "Todos los distritos" }, ...districtOptions],
    [districtOptions]
  );

  const stageOptions = [
    { value: "all", label: "Todas las etapas" },
    { value: "Entrega inmediata", label: "Entrega inmediata" },
    { value: "En construcción", label: "En construcción" },
    { value: "En planos", label: "En planos" },
  ];

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-center gap-4 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Distrito</label>
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {allDistrictOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Precio mín</label>
          <input
            type="number"
            placeholder="Ej. 100000"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            className="h-9 w-28 rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Precio máx</label>
          <input
            type="number"
            placeholder="Ej. 500000"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            className="h-9 w-28 rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Etapa</label>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {stageOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <section>
        <h2 className="mb-6 text-xl font-semibold">Estadísticas</h2>
        <DashboardsSection filtered={filtered} />
      </section>

      <section>
        <h2 className="mb-6 text-xl font-semibold">Tabla de departamentos</h2>
        <DepartamentosTable data={filtered} />
      </section>
    </div>
  );
}
