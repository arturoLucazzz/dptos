"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { AssumptionsDialog } from "@/components/assumptions-dialog";
import type { PanelAssumptions } from "@/lib/assumption-defaults";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/inversiones", label: "Mis inversiones" },
  { href: "/mercado", label: "Mercado" },
  { href: "/configuracion", label: "Configuración" },
  { href: "/runs", label: "Corridas" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function TopBar({ assumptions }: { assumptions: PanelAssumptions }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex min-h-14 max-w-screen-2xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:flex-nowrap sm:gap-6 sm:py-0">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            d
          </span>
          <span className="hidden sm:inline">dptos</span>
        </Link>
        <nav className="order-last flex w-full items-center gap-0.5 overflow-x-auto whitespace-nowrap sm:order-none sm:w-auto sm:gap-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "whitespace-nowrap rounded-md px-2 py-2 text-xs font-medium transition-colors hover:bg-accent sm:px-3 sm:text-sm",
                isActive(pathname, href) ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex min-w-0 justify-end sm:ml-auto">
          <AssumptionsDialog initial={assumptions} />
        </div>
      </div>
    </header>
  );
}
