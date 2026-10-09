import type { NextConfig } from "next";

const OLD_HOST = "drive-music-taupe.vercel.app";
const NEW_ORIGIN = "https://drive-music.chakkritton.com";

const nextConfig: NextConfig = {
  // The old host redirects here from the app, not from Vercel's domain settings, so /sw.js can be
  // left out: a browser refuses a service worker script behind a redirect, and an installed old
  // worker that can't update keeps serving its cached page on the old host forever.
  async redirects() {
    return [
      {
        source: "/:path((?!sw\\.js$).*)",
        has: [{ type: "host", value: OLD_HOST }],
        destination: `${NEW_ORIGIN}/:path`,
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        source: "/(.*)",
        // No CSP on purpose: the app loads Google thumbnails and avatars and talks to a
        // PartyKit host from env, and a wrong policy would silently break playback.
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
