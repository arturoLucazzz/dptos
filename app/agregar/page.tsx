import { AgregarForm } from './agregar-form';

export const metadata = { title: 'Agregar aviso' };

export default function AgregarPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-6">
      <h1 className="text-2xl font-semibold">Agregar aviso</h1>
      <p className="text-sm text-muted-foreground">
        Para avisos que no están en las páginas que se leen solas: Facebook, Instagram, Google, páginas de
        inmobiliarias o edificios vistos en la calle. Pasan por la misma unión de duplicados que el resto.
      </p>
      <AgregarForm />
    </div>
  );
}
