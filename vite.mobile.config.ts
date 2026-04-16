import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react(), svgr()],
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist/mobile'),
    emptyOutDir: true,
  },
})
