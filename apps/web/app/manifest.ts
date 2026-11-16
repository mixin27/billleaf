import type { MetadataRoute } from "next"

/** Install metadata (Add to Home Screen / desktop install). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Billleaf",
    short_name: "Billleaf",
    description:
      "Quotes, contracts, time, invoices and payments for freelancers and small studios.",
    start_url: "/app",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#15803D",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/brand/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
