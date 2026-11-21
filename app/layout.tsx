import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";
import { TopBar } from "@/components/top-bar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HistoryRefresh } from "./inversiones/history-refresh";
import { ASSUMPTIONS_COOKIE, parseAssumptionsCookie } from "@/lib/assumptions-cookie";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Dptos",
  description: "Análisis de departamentos en venta",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const assumptions = parseAssumptionsCookie((await cookies()).get(ASSUMPTIONS_COOKIE)?.value);

  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen font-sans bg-background text-foreground antialiased">
        <NuqsAdapter>
            <TooltipProvider>
              <HistoryRefresh />
              <TopBar assumptions={assumptions} />
              <main className="mx-auto w-full max-w-screen-2xl py-6 px-4">{children}</main>
            </TooltipProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
