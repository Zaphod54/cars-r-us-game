import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "game.js",
      name: "CarsRUsStandalone",
      formats: ["iife"],
      fileName: () => "game.bundle.js",
    },
    outDir: "standalone",
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
