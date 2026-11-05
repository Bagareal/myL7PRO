import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// The strict CSP only applies to the final build: in development Vite injects inline scripts and a WebSocket.
const cspSoloBuild: Plugin = {
  name: "csp-solo-build",
  apply: "build",
  transformIndexHtml: () => [
    {
      tag: "meta",
      injectTo: "head-prepend",
      attrs: {
        "http-equiv": "Content-Security-Policy",
        content: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
      },
    },
  ],
};

export default defineConfig({
  main: {
    build: { rollupOptions: { input: { index: "src/main/index.ts" } } },
  },
  preload: {
    // A preload running with the sandbox on must be CommonJS.
    build: {
      rollupOptions: {
        input: { index: "src/preload/index.ts" },
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    plugins: [react(), cspSoloBuild],
    build: { rollupOptions: { input: resolve(import.meta.dirname, "src/renderer/index.html") } },
  },
});
