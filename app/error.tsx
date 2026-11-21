"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Algo salió mal.</h1>
      <button
        type="button"
        onClick={reset}
        className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
      >
        Reintentar
      </button>
    </div>
  );
}
