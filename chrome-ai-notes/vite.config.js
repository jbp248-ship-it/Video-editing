import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve } from "path";

/**
 * Chrome Extension Build — Multi-output strategy
 *
 * Why not @crxjs/vite-plugin?
 *   CRXJS v2 beta has known issues with Vite 5 + MV3 service workers that
 *   import large libraries (@xenova/transformers). Until v2 is stable, we
 *   use a manual multi-output approach that's more predictable.
 *
 * Strategy:
 *   - `manualChunks` forces all shared code into the "sidepanel" chunk.
 *     The SW and offscreen entries get everything inlined because they
 *     never share a chunk with sidepanel.
 *   - `preserveEntrySignatures: "exports-only"` ensures each entry is
 *     self-contained with its deps inlined.
 *   - AudioWorklet stays a standalone file (no module imports possible).
 */
export default defineConfig({
  plugins: [
    react(),

    viteStaticCopy({
      targets: [
        { src: "manifest.json", dest: "." },
        { src: "icons/*.png", dest: "icons" },
        { src: "src/offscreen/offscreen.html", dest: "." },
        { src: "models/**/*", dest: "models" },
        { src: "node_modules/@xenova/transformers/dist/*.wasm", dest: "wasm" },
      ],
    }),
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
        // Ensure each entry is fully self-contained
        preserveEntrySignatures: "exports-only",

        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "sidepanel") return "assets/[name]-[hash].js";
          return "[name].js";
        },

        // Shared code only goes into sidepanel chunks.
        // background and offscreen get everything inlined because
        // they are never referenced by a chunk name here.
        manualChunks: (id) => {
          // React, idb, and other libs used by sidepanel can be chunked
          if (id.includes("node_modules/react") ||
              id.includes("node_modules/react-dom") ||
              id.includes("node_modules/idb")) {
            return "vendor";
          }
          // Everything else: let Rollup inline into the importing entry
          return undefined;
        },
      },
    },
  },

  define: {
    "import.meta.env.MODELS_PATH": JSON.stringify("/models"),
  },
});
