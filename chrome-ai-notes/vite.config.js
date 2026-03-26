import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    react(),

    // Copy ONNX model weights + WASM runtime into the extension bundle
    // so the extension works fully offline after the first install.
    viteStaticCopy({
      targets: [
        {
          // Whisper-tiny.en ONNX model files (downloaded by `npm run download-model`)
          src: "models/*",
          dest: "models",
        },
        {
          // @xenova/transformers ships its own WASM backend;
          // we copy it so the service worker can load it without a network.
          src: "node_modules/@xenova/transformers/dist/*.wasm",
          dest: "wasm",
        },
      ],
    }),
  ],

  build: {
    outDir: "dist",
    emptyOutDir: true,

    rollupOptions: {
      input: {
        // Side panel UI (React app)
        sidepanel: resolve(__dirname, "sidepanel.html"),

        // Background service worker (audio capture + Whisper inference)
        "service-worker": resolve(
          __dirname,
          "src/background/service-worker.js"
        ),

        // AudioWorklet processor (runs in its own scope, must stay a plain file)
        "audio-processor": resolve(__dirname, "src/audio/audio-processor.js"),

        // Offscreen document (bridges tabCapture → AudioWorklet)
        offscreen: resolve(__dirname, "src/offscreen/offscreen.html"),
      },

      output: {
        entryFileNames: (chunkInfo) => {
          // Keep the service worker and audio processor at predictable paths
          if (chunkInfo.name === "service-worker") {
            return "src/background/service-worker.js";
          }
          if (chunkInfo.name === "audio-processor") {
            return "src/audio/audio-processor.js";
          }
          if (chunkInfo.name === "offscreen") {
            return "src/offscreen/offscreen.js";
          }
          return "assets/[name]-[hash].js";
        },
      },
    },
  },

  // Point the Transformers.js library at the local /models folder
  // instead of the Hugging Face CDN.
  define: {
    "import.meta.env.MODELS_PATH": JSON.stringify("/models"),
  },
});
