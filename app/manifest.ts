import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Trios Snow and Mowing Inc.",
    short_name: "Trios",
    description:
      "Book and manage year-round property care and moving services in St. John’s.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "en-CA",
    dir: "ltr",
    background_color: "#f8faf9",
    theme_color: "#1b5256",
    categories: ["business", "lifestyle", "utilities"],
    prefer_related_applications: false,
    icons: [
      {
        src: "/pwa/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Get a quote",
        short_name: "Quote",
        description: "Start a Trios property care or moving request.",
        url: "/book",
        icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Explore services",
        short_name: "Services",
        description: "Browse Trios property care and moving services.",
        url: "/services",
        icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "My property",
        short_name: "My property",
        description: "Open your private Trios property account.",
        url: "/portal",
        icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
