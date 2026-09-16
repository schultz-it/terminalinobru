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
      includeAssets: ['icona-192.png', 'icona-512.png'],
      manifest: {
        name: 'TerminalinoBru',
        short_name: 'TerminalinoBru',
        description: 'Terminalino barcode per Danea Easyfatt',
        lang: 'it',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f8fafc',
        theme_color: '#0f766e',
        icons: [
          { src: '/icona-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icona-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icona-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
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
  },
});
