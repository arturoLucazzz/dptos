"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SETTINGS_SECTIONS } from "./sections";

/** A side menu on a desktop, a row of links above the content on a phone. */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Configuración" className="flex gap-1 overflow-x-auto md:w-48 md:shrink-0 md:flex-col">
      {SETTINGS_SECTIONS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent",
              active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
