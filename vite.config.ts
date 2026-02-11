import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/Yapp/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png', 'icons/*.svg'],
      manifest: {
        name: "Yappin'",
        short_name: "Yappin'",
        description: 'Keep yappin\' man',
        theme_color: '#65a30d',
        background_color: '#111B21',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/Yapp/',
        start_url: '/Yapp/',
        icons: [
          { src: '/Yapp/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/Yapp/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/Yapp/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*firebasedatabase\.app\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'rtdb-cache', expiration: { maxEntries: 50, maxAgeSeconds: 300 } },
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
