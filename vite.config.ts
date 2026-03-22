import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["opoll-favicon.png", "logo.png", "icon-512.png", "robots.txt"],
      manifest: {
        name: "OPOLL — Social Prediction Market",
        short_name: "OPOLL",
        description: "TikTok for predictions. Swipe, predict, and earn on real-world events.",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          {
            src: "/opoll-favicon.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/opoll-favicon.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/~oauth/, /^\/auth/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp}"],
        importScripts: ["/push-sw.js"],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // ALL Supabase requests must bypass SW cache to prevent stale tokens
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'web3': ['wagmi', 'viem', '@reown/appkit', '@reown/appkit-adapter-wagmi', '@wagmi/connectors'],
          'ui': ['framer-motion', 'recharts', '@radix-ui/react-dialog', '@radix-ui/react-popover', '@radix-ui/react-dropdown-menu'],
          'supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
}));
