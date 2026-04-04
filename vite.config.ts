import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["pdfjs-dist"],
  },
  server: {
    headers: {
      "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:",
        "connect-src 'self' http://localhost:3001 ws://localhost:5173 ws://localhost:5174",
        "img-src 'self' data: blob:",
        "worker-src 'self' blob:",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data:",
      ].join("; "),
    },
  },
})
