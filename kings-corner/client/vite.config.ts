import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/kings-corner/',
  plugins: [react()],
  server: {
    proxy: {
      // Use an explicit IPv4 loopback. On systems where localhost resolves to
      // ::1, Vite otherwise cannot reach the IPv4-bound game server.
      '/kings-corner/socket.io': { target: 'http://127.0.0.1:5100', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
