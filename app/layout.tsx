import type { Metadata } from "next";
import "./globals.css";
import { TopBar } from "@/components/top-bar";
import { FavoritesProvider } from "./providers";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "Dptos",
  description: "Análisis de departamentos en venta",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let favoriteIds: string[] = [];
  try {
    const favorites = await prisma.property.findMany({
      where: { favorite: true },
      select: { id: true },
    });
    favoriteIds = favorites.map((f) => f.id);
  } catch {
    // Fresh checkout with no DB yet: the app still renders.
  }

  return (
    <html lang="es">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <FavoritesProvider initialFavoriteIds={favoriteIds}>
          <TopBar />
          <main className="mx-auto w-full max-w-7xl py-6 px-4">{children}</main>
        </FavoritesProvider>
      </body>
    </html>
  );
}
