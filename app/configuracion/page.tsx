import Link from "next/link";
import { SETTINGS_SECTIONS } from "./sections";

export default function ConfiguracionPage() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {SETTINGS_SECTIONS.map(({ href, label, description }) => (
        <Link
          key={href}
          href={href}
          className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
        >
          <h2 className="text-lg font-semibold">{label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </Link>
      ))}
    </div>
  );
}
