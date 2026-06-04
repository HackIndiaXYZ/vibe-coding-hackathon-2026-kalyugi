import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono, Syne } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body-md",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-display-lg",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-data-sm",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ReportAI - Client Reporting Command Center",
  description: "AI-powered client reporting SaaS for Indian digital marketing agencies.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${dmSans.variable} ${syne.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Material Symbols is an icon font; next/font does not support it */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-on-surface antialiased min-h-screen min-h-[100dvh] overflow-x-hidden font-body-md">
        {children}
      </body>
    </html>
  );
}
