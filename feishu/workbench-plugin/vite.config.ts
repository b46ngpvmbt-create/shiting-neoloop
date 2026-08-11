import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    sourcemap: true,
    assetsInlineLimit: 0,
    // The official Base SDK is intentionally bundled as the production host
    // adapter. Its minified chunk is ~857 kB (~271 kB gzip) at 1.0.2.
    chunkSizeWarningLimit: 900,
  },
});
