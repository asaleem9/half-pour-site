import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Locally the build goes to dist.nosync so iCloud Drive leaves it alone; Vercel builds into dist.
const onVercel = Boolean(process.env.VERCEL);

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || "https://half-pour-site.vercel.app",
  outDir: onVercel ? "./dist" : "./dist.nosync",
  compressHTML: true,
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
  },
});
