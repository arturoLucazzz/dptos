"use client";

import { useMemo, useState } from "react";
import { DashboardsSection } from "./dashboards-section";
import { DepartamentosTable } from "./departamentos-table";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MultiSelect, MultiSelectOption } from "@/components/ui/multi-select";
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
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [operationType, setOperationType] = useState<string>("Venta");

  // Convert district options to MultiSelectOption format
  const multiSelectDistrictOptions: MultiSelectOption[] = useMemo(() =>
    districtOptions.map((d) => ({
      label: d.label,
      value: d.value,
    })),
    [districtOptions]
  );

  const filtered = useMemo(() => {
    let list = [...apartments];
    
    if (selectedDistricts.length > 0) {
      list = list.filter((r) => selectedDistricts.includes(r.limaDistrictSlug ?? ""));
    }
    
    const min = priceMin ? Number(priceMin) : null;
    const max = priceMax ? Number(priceMax) : null;
    if (min != null && !Number.isNaN(min)) list = list.filter((r) => r.price != null && r.price >= min);
    if (max != null && !Number.isNaN(max)) list = list.filter((r) => r.price != null && r.price <= max);
    
    if (operationType !== "Todos") {
      list = list.filter((r) => (r.operationType ?? "") === operationType);
    }
    
    return list;
  }, [apartments, selectedDistricts, priceMin, priceMax, operationType]);

  const operationTypeOptions = [
    { value: "Todos", label: "Todos los tipos" },
    { value: "Venta", label: "Venta" },
    { value: "Alquiler", label: "Alquiler" },
  ];

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-center gap-4 rounded-lg border bg-card p-4">
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
          <label className="text-sm text-muted-foreground">Tipo de Operación</label>
          <Select
            value={operationType}
            onValueChange={setOperationType}
            options={operationTypeOptions}
            className="w-[180px]"
            placeholder="Seleccionar tipo"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm text-muted-foreground">Precio mín</label>
          <Input
            type="number"
            placeholder="Ej. 100000"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            className="w-32 h-9"
          />
        </div>
        
        <div className="flex flex-col gap-2">
          <label className="text-sm text-muted-foreground">Precio máx</label>
          <Input
            type="number"
            placeholder="Ej. 500000"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            className="w-32 h-9"
          />
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