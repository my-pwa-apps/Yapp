import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/Yapp/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png', 'icons/*.svg', 'offline.html', 'robots.txt'],
      manifest: {
        id: '/Yapp/',
        name: "Yappin'",
        short_name: "Yappin'",
        description: "Yappin' is a modern chat app. Send messages, GIFs, stickers, photos, and voice messages. Make audio and video calls. Keep yappin' man!",
        theme_color: '#65a30d',
        background_color: '#111B21',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/Yapp/',
        start_url: '/Yapp/',
        lang: 'en',
        dir: 'ltr',
        categories: ['social', 'communication'],
        prefer_related_applications: false,
        icons: [
          { src: '/Yapp/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/Yapp/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/Yapp/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        screenshots: [
          {
            src: '/Yapp/screenshots/desktop.svg',
            sizes: '1280x720',
            type: 'image/svg+xml',
            form_factor: 'wide',
            label: "Yappin' desktop chat view",
          },
          {
            src: '/Yapp/screenshots/mobile.svg',
            sizes: '390x844',
            type: 'image/svg+xml',
            form_factor: 'narrow',
            label: "Yappin' mobile chat list",
          },
        ],
        shortcuts: [
          {
            name: 'New Chat',
            short_name: 'Chat',
            url: '/Yapp/',
            icons: [{ src: '/Yapp/icons/icon-192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        importScripts: ['/Yapp/push-sw.js'],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/Yapp/offline.html',
        navigateFallbackAllowlist: [/^\/Yapp\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*firebasedatabase\.app\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'rtdb-cache', expiration: { maxEntries: 50, maxAgeSeconds: 300 } },
          },
          {
            urlPattern: /^https:\/\/api\.giphy\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'giphy-cache', expiration: { maxEntries: 100, maxAgeSeconds: 86400 } },
          },
          {
            urlPattern: /^https:\/\/media[0-9]*\.giphy\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'giphy-media-cache', expiration: { maxEntries: 200, maxAgeSeconds: 604800 } },
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
