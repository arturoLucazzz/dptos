import type { Metadata } from "next";
import "./globals.css";
import { TopBar } from "@/components/top-bar";
import { FavoritesProvider } from "./providers";

export const metadata: Metadata = {
  title: "Dptos",
  description: "Análisis de departamentos en venta",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <FavoritesProvider>
          <TopBar />
          <main className="mx-auto w-full max-w-7xl py-6 px-4">{children}</main>
        </FavoritesProvider>
      </body>
    </html>
  );
}
