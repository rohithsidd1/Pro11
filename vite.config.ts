import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const BUILD_TIME = new Date().toISOString()
const versionFile = { name: 'pro11-version', generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void }) {
  this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_TIME }) })
} }

export default defineConfig({
  define: { __BUILD_TIME__: JSON.stringify(BUILD_TIME) },
  plugins: [
    versionFile,
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,   // registered in src/main.tsx, which also checks for updates
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Pro11',
        short_name: 'Pro11',
        description: 'Cricket games for the family',
        theme_color: '#F6CD86',
        background_color: '#F6CD86',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        importScripts: ['push-sw.js'],
        globIgnores: ['**/version.json'],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
})
