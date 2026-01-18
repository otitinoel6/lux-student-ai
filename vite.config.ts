import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { mochaPlugins } from "@getmocha/vite-plugins";

const isVercel = process.env.VERCEL === "1";

export default defineConfig({
  plugins: [
    ...mochaPlugins(process.env as any),
    react(),
    !isVercel && cloudflare(), // ⬅️ disable on Vercel
  ].filter(Boolean),

  build: {
    outDir: "dist", // ⬅️ force correct output
    chunkSizeWarningLimit: 5000,
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});


