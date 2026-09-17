/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwind(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'TerminalinoBru',
        short_name: 'TerminalinoBru',
        description: 'Terminalino barcode per Danea Easyfatt',
        lang: 'it',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F4F4F4',
        theme_color: '#F2CE2E',
        icons: [
          { src: '/icona-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icona-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icona-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icona-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Font compresi: l'app deve aprirsi identica anche senza rete.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        // Le chiamate al bridge non passano mai dalla cache del service worker.
        navigateFallbackDenylist: [/^\/api\//, /^\/easyfatt\//],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
      '/easyfatt': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/preparazione.ts'],
  },
});
