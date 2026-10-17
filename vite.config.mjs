import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Keeps the CRA-era `process.env.REACT_APP_*` / `process.env.PUBLIC_URL` references working.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "REACT_APP_"), ...pickReactEnv(process.env) };
  return {
    base: "./",
    plugins: [react()],
    resolve: { alias: { src: path.resolve(import.meta.dirname, "src") } },
    define: {
      "process.env.PUBLIC_URL": JSON.stringify("."),
      ...Object.fromEntries(Object.entries(env).map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)])),
    },
    build: {
      outDir: "build",
      rollupOptions: {
        output: {
          // Separate vendor chunks cache independently of app code and download in parallel
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            // maplibre (and its leaflet bridge) stay in their own lazy chunk
            if (id.includes("/node_modules/leaflet/")) return "leaflet";
            if (id.includes("@chakra-ui") || id.includes("@emotion") || id.includes("@ark-ui") || id.includes("@zag-js")) return "chakra";
            if (id.includes("gtfs-realtime-bindings") || id.includes("protobufjs")) return "gtfs-rt";
          },
        },
      },
    },
    server: { port: Number(loadEnv(mode, process.cwd(), "PORT").PORT || 3000) },
  };
});

function pickReactEnv(e) {
  return Object.fromEntries(Object.entries(e).filter(([k]) => k.startsWith("REACT_APP_")));
}
