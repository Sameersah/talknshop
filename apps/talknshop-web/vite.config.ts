import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // Listen on all addresses
    strictPort: true,
    proxy: {
      // Forward /api to orchestrator so attach (upload URL) works without CORS; run orchestrator on 8000
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // WebSocket for chat
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})






