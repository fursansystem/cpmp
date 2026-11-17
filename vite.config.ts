import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      "@radix-ui/react-direction": path.resolve(import.meta.dirname, "node_modules", "@radix-ui", "react-direction"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 4000,
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.PORT || 5002}`,
        changeOrigin: true,
      },
      "/ws": {
        target: `ws://localhost:${process.env.PORT || 5002}`,
        ws: true,
      },
    },
    fs: {
      strict: true,
      allow: [".."],
      deny: ["**/.*"],
    },
  },
});
