import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Email Doc Extractor | AI-Powered Document Processing",
  description: "Extrae datos de documentos adjuntos en emails automáticamente usando IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body className={`${inter.variable} font-sans antialiased bg-slate-950 text-slate-50`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
