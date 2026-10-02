import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import { SpeedInsights } from "@vercel/speed-insights/next"
import { themeInitScript } from "@/lib/themes";
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

// No themeColor here on purpose: it'd be a single hardcoded value, wrong for every theme but
// one. ThemeProvider creates and owns the <meta name="theme-color"> instead, filling it from
// whichever theme is actually applied — being the only writer is what keeps it unambiguous,
// since browsers honour the first such tag and ignore the rest.
export const viewport: Viewport = {
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
      // The script below adds data-theme/data-scheme, which the server render can't know about.
      suppressHydrationWarning
    >
      <head>
        {/* Runs synchronously while the browser is still parsing <head>, i.e. before the first
            paint — the theme lives in localStorage, so without this every load would flash the
            server's default before settling on the user's choice. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
      </head>
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
