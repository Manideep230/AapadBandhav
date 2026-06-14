import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const hmrHost = process.env.VITE_HMR_HOST;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    allowedHosts: ['.devtunnels.ms'],
    hmr: hmrHost
      ? {
          protocol: 'wss',
          host: hmrHost,
          clientPort: 443,
        }
      : false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        ws: true,
        rewriteWsOrigin: true,
      },
    },
  },
});
