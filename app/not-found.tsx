import Link from "next/link";

const linkClass = "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Esta página ya no existe</h1>
      <p className="text-sm text-muted-foreground">Prueba con una de estas pantallas.</p>
      <nav className="flex flex-wrap justify-center gap-2">
        <Link href="/" className={linkClass}>
          Inicio
        </Link>
        <Link href="/inversiones" className={linkClass}>
          Mis inversiones
        </Link>
        <Link href="/mercado" className={linkClass}>
          Mercado
        </Link>
      </nav>
    </div>
  );
}
