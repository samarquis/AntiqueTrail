import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Antique Trail',
        short_name: 'Antique Trail',
        description: 'A trustworthy guide to antique stores and local finds.',
        theme_color: '#f7f4ee',
        background_color: '#f7f4ee',
        display: 'standalone',
        start_url: '/stores',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  server: { port: 4173, strictPort: true },
  preview: { port: 4173, strictPort: true },
})
