import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const base = process.env.GITHUB_PAGES === 'true' ? '/AntiqueTrail/' : '/'
  const ownerResearch = mode === 'owner-research'
  const env = loadEnv(mode, process.cwd(), '')
  const researchDigest = env.VITE_OWNER_RESEARCH_ARTIFACT_DIGEST ?? ''
  const researchManifest = {
    kind: 'antique-trail-owner-research',
    audience: 'synthetic',
    route: '/for-stores',
    indexing: 'noindex',
    deploymentProtection: 'required',
    artifactBinding: researchDigest,
  }
  const plugins: PluginOption[] = [react()]

  if (ownerResearch) {
    plugins.push({
      name: 'owner-research-artifact-contract',
      buildStart() {
        if (!/^https:\/\/.+\.supabase\.co$/u.test(env.VITE_SUPABASE_URL ?? ''))
          this.error('VITE_SUPABASE_URL must identify the isolated research project')
        if (!env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY.startsWith('replace-with-'))
          this.error('VITE_SUPABASE_ANON_KEY must identify the isolated research project')
        if (!/^sha256:[0-9a-f]{64}$/.test(researchDigest))
          this.error('VITE_OWNER_RESEARCH_ARTIFACT_DIGEST must be an exact sha256 binding')
        if (!/^[a-z0-9-]{3,40}$/.test(env.VITE_OWNER_RESEARCH_COHORT_KEY ?? ''))
          this.error('VITE_OWNER_RESEARCH_COHORT_KEY must identify one bounded cohort')
      },
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'owner-research-manifest.json',
          source: `${JSON.stringify(researchManifest, null, 2)}\n`,
        })
      },
    })
  } else {
    plugins.push(
      ...VitePWA({
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
          const forbidden = [
            'Synthetic Review Harness',
            'review-shopper-a',
            'reviewAs=',
            'owner_research_command',
            'Private research artifact',
            'existing-store-a',
            'topeka-owner-10a',
          ]
          for (const asset of Object.values(bundle)) {
            const source = asset.type === 'chunk' ? asset.code : String(asset.source)
            const marker = forbidden.find((value) => source.includes(value))
            if (marker) this.error(`Production bundle contains review-only marker: ${marker}`)
          }
        },
      },
    )
  }

  return {
    base,
    build: ownerResearch ? { rollupOptions: { input: 'owner-research.html' } } : undefined,
    plugins,
    publicDir: ownerResearch ? false : undefined,
    server: { port: 4173, strictPort: true },
    preview: { port: 4173, strictPort: true },
  }
})
