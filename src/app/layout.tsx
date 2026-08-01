import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import { SpeedInsights } from "@vercel/speed-insights/next"
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Drive Music",
  description: "Play music from your Google Drive, with offline caching.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Drive Music",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-dvh antialiased`}
    >
      {/* Fixed (not min-) height + overflow-hidden here is load-bearing: it's what makes each
          route's own <main overflow-y-auto> (app/(app)/layout.tsx, app/admin/page.tsx) the
          actual scroll container instead of the whole document — without it, content just
          grows the body and the page scrolls, so scroll-position tracking (e.g. the header
          hide-on-scroll-down/show-on-scroll-up) never sees any movement. */}
      <body className="flex h-dvh flex-col overflow-hidden">
        <Providers>{children}</Providers>
        <SpeedInsights />
      </body>
    </html>
  );
}
