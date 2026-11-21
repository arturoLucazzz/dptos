import type { ReactNode } from "react";
import { SettingsNav } from "./settings-nav";

export default function ConfiguracionLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Configuración</h1>
      <div className="flex flex-col gap-6 md:flex-row">
        <SettingsNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
