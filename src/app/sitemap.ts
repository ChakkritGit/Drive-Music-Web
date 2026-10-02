import type { MetadataRoute } from "next";

const SITE = "https://drive-music-taupe.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/privacy", "/terms"].map((path) => ({ url: `${SITE}${path}` }));
}
