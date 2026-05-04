import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Ensure Vite env vars are always loaded and inlined into the production bundle.
  // This prevents runtime crashes like "supabaseUrl is required" when a remix/build
  // didn't pick up the .env values.
  const env = loadEnv(mode, process.cwd(), "VITE_");

  return {
    server: {
      host: "::",
      port: 8080,
    },
    // NOTE: We intentionally avoid overriding `import.meta.env.*` via `define` here.
    // Some Vite builds can behave unexpectedly when sub-properties are manually defined.
    // Standard Vite `VITE_` env injection is used instead.

    plugins: [
      react(),
      mode === "development" && componentTagger(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.ico", "og-image.png", "models/**/*"],
        manifest: {
          name: "Presence - Face Attendance",
          short_name: "Presence",
          description: "AI-Powered Face Recognition Attendance System",
          theme_color: "#3b82f6",
          background_color: "#0f172a",
          display: "standalone",
          orientation: "portrait-primary",
          scope: "/",
          start_url: "/",
          icons: [
            {
              src: "/favicon.ico",
              sizes: "64x64",
              type: "image/x-icon",
            },
            {
              src: "/og-image.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
          categories: ["education", "productivity"],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB limit
          navigateFallbackDenylist: [/^\/~oauth/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
              handler: "NetworkFirst",
              options: {
                cacheName: "supabase-cache",
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
          ],
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: [
        {
          find: "@/integrations/supabase/client",
          replacement: path.resolve(__dirname, "./src/integrations/supabase/safeClient.ts"),
        },
        {
          find: "@",
          replacement: path.resolve(__dirname, "./src"),
        },
      ],
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom", "react-router-dom"],
            faceapi: ["face-api.js"],
            firebase: ["firebase/app", "firebase/storage"],
            supabase: ["@supabase/supabase-js"],
          },
        },
      },
    },
    optimizeDeps: {
      exclude: ["face-api.js"],
    },
    css: {
      devSourcemap: true,
    },
  };
});

