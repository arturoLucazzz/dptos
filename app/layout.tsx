import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";
import { TopBar } from "@/components/top-bar";
import { FavoritesProvider } from "./providers";
import { prisma } from "@/lib/db";
import { ASSUMPTIONS_COOKIE, parseAssumptionsCookie } from "@/lib/assumptions-cookie";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

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

  const assumptions = parseAssumptionsCookie((await cookies()).get(ASSUMPTIONS_COOKIE)?.value);

  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen font-sans bg-background text-foreground antialiased">
        <NuqsAdapter>
          <FavoritesProvider initialFavoriteIds={favoriteIds}>
            <TopBar assumptions={assumptions} />
            <main className="mx-auto w-full max-w-screen-2xl py-6 px-4">{children}</main>
          </FavoritesProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
