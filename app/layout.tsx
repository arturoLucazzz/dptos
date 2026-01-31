import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dptos",
  description: "Real estate listings",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
