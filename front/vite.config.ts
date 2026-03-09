import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'manifest.json'],
      manifest: {
        name: 'GymTracker',
        short_name: 'GymTracker',
        start_url: '/gymtracker/',
        display: 'standalone',
        background_color: '#09090b',
        theme_color: '#09090b',
        icons: [{
          src: '/gymtracker/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/gymtracker/index.html'
      }
    })
  ],
  base: '/gymtracker/', // GitHub Pages путь для репозитория gymtracker
})