import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import { DockAnalytics } from "@/components/DockAnalytics";
import "./globals.css";
import { STARTUP_IMAGES } from "@/lib/splash";
import { PwaChrome } from "@/components/pwa-chrome";

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

/** schema.org description of the app for search engines. */
const APP_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Drive Music",
  "url": "https://drive-music.chakkritton.com/",
  "applicationCategory": "MultimediaApplication",
  "operatingSystem": "Any (web browser, installable PWA)",
  "browserRequirements": "Requires a Google account",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "description": "A personal music player for the audio files in your own Google Drive: streams and caches tracks, mixes them like a DJ and syncs what is playing across your devices.",
  "author": {
    "@type": "Person",
    "name": "Chakkrit Laolit",
    "url": "https://chakkritton.com"
  }
};

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
    locale: "en_US",
    title: "Drive Music",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "Drive Music", description: DESCRIPTION },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Drive Music",
    startupImage: STARTUP_IMAGES,
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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(APP_LD) }} />
        <Providers>{children}</Providers>
        <DockAnalytics />
        <PwaChrome />
      </body>
    </html>
  );
}
