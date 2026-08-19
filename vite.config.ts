import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(() => {
  const base = process.env.GITHUB_PAGES === 'true' ? '/AntiqueTrail/' : '/'

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.svg',
          'app-icon.svg',
          'app-icon-192.png',
          'app-icon-512.png',
          'apple-touch-icon.png',
        ],
        manifest: {
          name: 'Antique Trail',
          short_name: 'Antique Trail',
          description: 'A trustworthy guide to antique stores and local finds.',
          theme_color: '#f6f4f0',
          background_color: '#f6f4f0',
          display: 'standalone',
          start_url: `${base}stores`,
          icons: [
            {
              src: `${base}app-icon-192.png`,
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable',
            },
            {
              src: `${base}app-icon-512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
            {
              src: `${base}app-icon.svg`,
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
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
  }
})
