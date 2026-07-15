import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        proxyTimeout: 0,
        timeout: 0,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            req.socket.setTimeout(0);
            proxyReq.setTimeout(0);
          });
        },
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/manifest.json': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-lucide';
            }
            if (id.includes('echarts') || id.includes('zrender')) {
              return 'vendor-echarts';
            }
            if (id.includes('firebase')) {
              return 'vendor-firebase';
            }
            if (id.includes('pdfjs-dist')) {
              return 'vendor-pdfjs';
            }
            if (id.includes('livekit-client')) {
              return 'vendor-livekit';
            }
            if (id.includes('xlsx')) {
              return 'vendor-xlsx';
            }
            if (id.includes('jspdf')) {
              return 'vendor-jspdf';
            }
            if (id.includes('@tanstack') || id.includes('axios')) {
              return 'vendor-core';
            }
            return 'vendor';
          }
        }
      }
    }
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
  worker: {
    format: 'es',
  },
});
