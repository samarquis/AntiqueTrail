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
      workbox: {
        navigateFallbackDenylist: [/^\/auth\/(?:callback|register|verify|recovery)(?:\/|$)/],
      },
    }),
    {
      name: 'exclude-review-harness-from-production',
      apply: 'build',
      generateBundle(_options, bundle) {
        const forbidden = ['Synthetic Review Harness', 'review-shopper-a', 'reviewAs=']
        for (const asset of Object.values(bundle)) {
          const source = asset.type === 'chunk' ? asset.code : String(asset.source)
          const marker = forbidden.find((value) => source.includes(value))
          if (marker) this.error(`Production bundle contains review-only marker: ${marker}`)
        }
      },
    },
  ],
  server: { port: 4173, strictPort: true },
  preview: { port: 4173, strictPort: true },
})
