import type { Metadata } from "next";
import { Lora, Roboto } from "next/font/google";
import "./globals.css";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  display: "swap"
});

const roboto = Roboto({
  subsets: ["latin"],
  variable: "--font-roboto",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Cherrish AI Matchmaker",
  description:
    "An empathetic wise Matchmaker Friend helping you in finding a great love match."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`antialiased ${lora.variable} ${roboto.variable}`}>
      <body className="bg-brand-dark bg-luxury-glow min-h-screen text-text-main selection:bg-accent selection:text-brand-dark">
        <main className="flex flex-col items-center justify-center min-h-screen px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
