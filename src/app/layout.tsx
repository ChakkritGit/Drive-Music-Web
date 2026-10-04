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

const DESCRIPTION =
  "A personal music player for the audio files in your own Google Drive: offline downloads, DJ-style mixing, an equalizer and cross-device sync. Read-only access, no ads, no tracking.";

export const metadata: Metadata = {
  // Absolute URLs for the OG image and canonical; the production host, not a preview one.
  metadataBase: new URL("https://drive-music.chakkritton.com"),
  title: { default: "Drive Music", template: "%s · Drive Music" },
  description: DESCRIPTION,
  applicationName: "Drive Music",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Drive Music",
    title: "Drive Music",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "Drive Music", description: DESCRIPTION },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Drive Music",
  },
  verification: {
    google: "B5OIhoMKpXg4QcPM0FcVLJUQ6hqwnKxqzd_xARGQf9Q",
  },
};

// The browser chrome matches the page in either scheme: the colours are the two backgrounds in
// globals.css.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
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
