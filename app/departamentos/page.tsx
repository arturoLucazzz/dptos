import { Suspense } from "react";
import { DepartamentosUnifiedClient } from "./departamentos-unified-client";

export const dynamic = "force-dynamic";

export default function DepartamentosPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
      <DepartamentosUnifiedClient />
    </Suspense>
  );
}
