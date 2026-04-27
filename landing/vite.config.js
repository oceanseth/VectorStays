import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Local dev:
//   npm run dev               → /api/* proxied to https://bnbmesh.ai (prod backend)
//   API_TARGET=http://localhost:3001 npm run dev
//                             → /api/* proxied to a local node server (api/local.mjs)
//
// Production build emits sourcemaps so minified errors are debuggable in DevTools.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.API_TARGET || 'https://bnbmesh.ai'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          // bnbmesh.ai serves both site + /api, so passthrough the path.
        },
      },
    },
    build: {
      sourcemap: true,
    },
    // Force pre-bundling of @vapi-ai/web so its CJS default export is wrapped
    // consistently. Skipping this lets Rollup pick a different shape than esbuild.
    optimizeDeps: {
      include: ['@vapi-ai/web'],
    },
  }
})
