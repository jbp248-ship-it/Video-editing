import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve } from "path";
import { existsSync } from "fs";

/**
 * Chrome Extension Build
 *
 * Strategy:
 *   - Service worker, offscreen, and worklet are separate Rollup entries.
 *   - manualChunks routes React/idb into a "vendor" chunk for sidepanel only.
 *     Everything else stays inlined in the entry that imports it.
 *   - Models and WASM are copied only if they exist (first build before
 *     model download still succeeds).
 */

// Conditionally include model/wasm copy targets
const staticTargets = [
  { src: "manifest.json", dest: "." },
  { src: "icons/*.png", dest: "icons" },
  { src: "src/offscreen/offscreen.html", dest: "." },
];

// Only copy models if they've been downloaded
if (existsSync(resolve(__dirname, "models/Xenova"))) {
  staticTargets.push({ src: "models/**/*", dest: "models" });
}

// Only copy WASM if node_modules exists
if (existsSync(resolve(__dirname, "node_modules/@xenova/transformers/dist"))) {
  staticTargets.push({
    src: "node_modules/@xenova/transformers/dist/*.wasm",
    dest: "wasm",
  });
}

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({ targets: staticTargets }),
  ],

  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
    target: "esnext",

    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, "sidepanel.html"),
        background: resolve(__dirname, "src/background/service-worker.js"),
        offscreen: resolve(__dirname, "src/offscreen/offscreen.js"),
        "audio-processor": resolve(__dirname, "src/audio/audio-processor.js"),
      },

      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "sidepanel") return "assets/[name]-[hash].js";
          return "[name].js";
        },

        // Route sidepanel-only libs into a vendor chunk.
        // SW and offscreen don't import React/idb, so their deps stay inlined.
        manualChunks: (id) => {
          if (id.includes("node_modules/react") ||
              id.includes("node_modules/react-dom") ||
              id.includes("node_modules/idb")) {
            return "vendor";
          }
          return undefined;
        },
      },
    },
  },

  define: {
    "import.meta.env.MODELS_PATH": JSON.stringify("/models"),
  },
});
