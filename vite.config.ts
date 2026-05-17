import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const apiTarget = process.env.VITE_E2E_API_TARGET ?? "http://127.0.0.1:3001";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "public",
      filename: "firebase-messaging-sw.js",
      injectRegister: false,
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
    }),
  ],
  server: {
    port: 5173,
    host: "0.0.0.0",
    strictPort: true,
    // Vite 6+ 預設只允許 localhost host header,Tailscale hostname / 100.x.x.x 會被擋
    // 開 true 全放(僅信任的 tailnet 內可達,我們已用 Tailscale 控網路層存取)
    allowedHosts: true,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: false },
    },
  },
  preview: {
    port: 4173,
    host: "0.0.0.0",
    strictPort: true,
    allowedHosts: true,
    // 跟 dev server 一樣 proxy /api → backend(bun run start 用 preview 提供前端時生效)
    proxy: {
      "/api": { target: apiTarget, changeOrigin: false },
    },
  },
});
