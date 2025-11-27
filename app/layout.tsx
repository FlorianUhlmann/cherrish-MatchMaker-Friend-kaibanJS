import type { Metadata } from "next";
import { Lora, Roboto } from "next/font/google";
import "./globals.css";

const heading = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-heading"
});
const body = Roboto({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-body"
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
    <html lang="en">
      <body
        className={`${heading.variable} ${body.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
