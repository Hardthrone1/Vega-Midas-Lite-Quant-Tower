import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import federation from '@originjs/vite-plugin-federation'
import { fileURLToPath } from 'node:url'

// Micro-frontend scaling (Azure Portal-style extension loading).
// Off by default so the standard dev/build flow is unchanged. Enable with:
//   VITE_FEDERATION=1 npm run build
// The shell then emits a remoteEntry.js exposing the panels below, and can
// itself consume remote plugins declared as:
//   VITE_FEDERATION_REMOTES="name@https://host/assets/remoteEntry.js,other@..."
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const federationEnabled = env.VITE_FEDERATION === '1'

  const remotes = Object.fromEntries(
    (env.VITE_FEDERATION_REMOTES ?? '')
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const [name, ...url] = pair.split('@')
        return [name, url.join('@')]
      })
  )

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(federationEnabled
        ? [
            federation({
              name: 'vega_shell',
              filename: 'remoteEntry.js',
              exposes: {
                './ReplayPanel': './src/features/replay/components/ReplayPanel',
                './SwarmPanel': './src/features/swarm/components/SwarmPanel',
                './BacktestPanel': './src/features/backtest/components/BacktestPanel',
              },
              remotes,
              shared: ['react', 'react-dom', 'zustand', 'zod', '@fluentui/react-components'],
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      // Module federation requires top-level await support.
      target: federationEnabled ? 'esnext' : 'modules',
      rollupOptions: federationEnabled
        ? {}
        : {
            output: {
              manualChunks: {
                'vendor-react': ['react', 'react-dom'],
                'vendor-charts': ['lightweight-charts'],
                'vendor-zod': ['zod'],
                'vendor-fluent': ['@fluentui/react-components', '@fluentui/react-icons'],
              },
            },
          },
    },
  }
})
