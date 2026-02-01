"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Building2, BarChart3, Heart } from "lucide-react";

const links = [
  { href: "/departamentos", label: "Departamentos", icon: Building2 },
  { href: "/estadisticas", label: "Estadísticas", icon: BarChart3 },
  { href: "/favoritos", label: "Favoritos", icon: Heart },
];

export function TopBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center gap-6 px-4">
        <Link href="/departamentos" className="flex items-center gap-2 font-semibold">
          <Building2 className="h-6 w-6" />
          <span className="hidden sm:inline">Dptos</span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                pathname === href ? "bg-accent text-accent-foreground" : "text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
