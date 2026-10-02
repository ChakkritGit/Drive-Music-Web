import type { MetadataRoute } from "next";

// Only the public pages are worth indexing; everything else needs a Google sign-in.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/settings"] },
    sitemap: "https://drive-music.chakkritton.com/sitemap.xml",
  };
}
