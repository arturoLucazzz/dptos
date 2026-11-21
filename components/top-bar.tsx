"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssumptionsDialog } from "@/components/assumptions-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PanelAssumptions } from "@/lib/assumption-defaults";

const mainLinks = [
  { href: "/", label: "Inicio" },
  { href: "/inversiones", label: "Mis inversiones" },
  { href: "/mercado", label: "Mercado" },
];

const moreLinks = [
  { href: "/zonas", label: "Zonas" },
  { href: "/alertas", label: "Alertas" },
  { href: "/agregar", label: "Agregar" },
  { href: "/runs", label: "Corridas" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function TopBar({ assumptions }: { assumptions: PanelAssumptions }) {
  const pathname = usePathname();
  const moreActive = moreLinks.some((l) => isActive(pathname, l.href));

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex min-h-14 max-w-screen-2xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:flex-nowrap sm:gap-6 sm:py-0">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            d
          </span>
          <span className="hidden sm:inline">dptos</span>
        </Link>
        <nav className="order-last flex w-full items-center gap-0.5 sm:order-none sm:w-auto sm:gap-1">
          {mainLinks.map(({ href, label }) => (
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
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Más"
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-2 text-sm font-medium transition-colors hover:bg-accent",
                  moreActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Más</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-44 p-1">
              {moreLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "block rounded-sm px-3 py-2 text-sm hover:bg-accent",
                    isActive(pathname, href) ? "text-primary" : "text-foreground"
                  )}
                >
                  {label}
                </Link>
              ))}
            </PopoverContent>
          </Popover>
        </nav>
        <div className="ml-auto flex min-w-0 justify-end sm:ml-auto">
          <AssumptionsDialog initial={assumptions} />
        </div>
      </div>
    </header>
  );
}
