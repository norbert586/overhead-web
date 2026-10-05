import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Stamp the build with its release and commit. The release (VERSION at the
// repo root, bumped by the changelog bot on every merge) is what people see;
// the commit is how the app spots that it's older than the server — e.g. a
// home-screen app still on a cached build.
function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'dev'
  }
}

function release(): string {
  try {
    return readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim() || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(release()),
    __APP_COMMIT__: JSON.stringify(process.env.GIT_SHA ?? gitSha()),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    // Installable app: the catch loop is a race against the aircraft passing,
    // so opening from a home-screen icon with a precached shell matters.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Overhead',
        short_name: 'Overhead',
        description: 'Catch the flights overhead — open the app when you hear one.',
        theme_color: '#EDE7D3',
        background_color: '#EDE7D3',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the shell; never intercept API or external photo traffic —
        // live aircraft data must always be live.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
  },
})
