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
      registerType: "prompt",
      devOptions: {
        enabled: false,
      },
      includeAssets: ["opoll-favicon.png", "logo.png", "icon-512.png", "robots.txt"],
      manifest: {
        name: "OPollmarket — Social Prediction Market",
        short_name: "OPollmarket",
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
        clientsClaim: false,
        navigateFallbackDenylist: [/^\/~oauth/, /^\/auth/],
        globPatterns: ["**/*.{js,css,ico,png,svg,jpg,jpeg,webp}"],
        importScripts: ["/push-sw.js"],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Always get latest HTML for navigations to avoid stale chunk references
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-pages",
              networkTimeoutSeconds: 5,
            },
          },
          {
            // Backend auth/data calls must bypass SW cache to prevent stale tokens/data
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
          'motion': ['framer-motion'],
          'charts': ['recharts'],
          'radix': ['@radix-ui/react-dialog', '@radix-ui/react-popover', '@radix-ui/react-dropdown-menu'],
          'supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
}));
