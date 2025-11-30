import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig(() => ({
  plugins: [vue()],
  server: {
    port: Number(process.env.VITE_DEV_PORT ?? 5173),
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY ?? "http://localhost:9001",
        changeOrigin: true,
      },
      "/healthz": {
        target: process.env.VITE_API_PROXY ?? "http://localhost:9001",
        changeOrigin: true,
      },
    },
  },
}));
