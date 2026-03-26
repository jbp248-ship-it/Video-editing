import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve } from "path";

/**
 * Chrome Extension Vite Build
 *
 * Key decisions:
 *   1. Service worker + offscreen + worklet are each their own Rollup input
 *      so Vite treats them as separate entry bundles.
 *   2. `inlineDynamicImports` is NOT used (it's incompatible with multiple
 *      inputs). Instead, we use `output.manualChunks` returning undefined
 *      to signal "inline everything into the entry" for non-sidepanel entries.
 *   3. The AudioWorklet must remain a single standalone file (no imports).
 *   4. The offscreen HTML is copied as a static asset; its JS is bundled
 *      as a separate entry. This avoids Vite trying to parse it as an
 *      HTML entry with module resolution issues.
 */
export default defineConfig({
  plugins: [
    react(),

    viteStaticCopy({
      targets: [
        { src: "manifest.json", dest: "." },
        { src: "icons/*.png", dest: "icons" },
        { src: "src/offscreen/offscreen.html", dest: "." },
        // Whisper ONNX model + tokenizer files
        { src: "models/**/*", dest: "models" },
        // WASM backend for @xenova/transformers
        { src: "node_modules/@xenova/transformers/dist/*.wasm", dest: "wasm" },
      ],
    }),
  ],

  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Increase chunk size warning threshold — ONNX models are large
    chunkSizeWarningLimit: 5000,

    rollupOptions: {
      input: {
        // React side panel — the only entry that can have chunks
        sidepanel: resolve(__dirname, "sidepanel.html"),

        // Service worker — must be ONE self-contained file.
        // Chrome MV3 service workers resolve `import` relative to the
        // extension root, but Vite's chunk filenames are unpredictable.
        // We force all deps to be inlined via manualChunks below.
        background: resolve(__dirname, "src/background/service-worker.js"),

        // Offscreen JS — also must be self-contained since its HTML
        // is a static copy with a bare <script src="offscreen.js">.
        offscreen: resolve(__dirname, "src/offscreen/offscreen.js"),

        // AudioWorklet — runs in a locked-down scope, CANNOT import.
        // Must stay a single plain JS file with no module syntax.
        "audio-processor": resolve(__dirname, "src/audio/audio-processor.js"),
      },

      output: {
        entryFileNames: (chunkInfo) => {
          // Side panel entry can be hashed (loaded by sidepanel.html)
          if (chunkInfo.name === "sidepanel") return "assets/[name]-[hash].js";
          // Everything else: predictable names at the dist root
          return "[name].js";
        },

        // Force all shared code to be inlined into each entry point.
        // This prevents Vite from creating chunk-XXXX.js files that the
        // service worker and offscreen doc can't resolve.
        manualChunks: (id, { getModuleInfo }) => {
          // Let sidepanel have its own chunks (React, idb, etc.)
          // But never split anything into a chunk that the SW or
          // offscreen might need — just inline everything.
          return undefined;
        },
      },
    },
  },

  define: {
    "import.meta.env.MODELS_PATH": JSON.stringify("/models"),
  },
});
