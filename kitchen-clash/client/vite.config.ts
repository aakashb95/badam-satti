import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/kitchen-clash/',
  plugins: [react()],
  server: {
    proxy: {
      '/kitchen-clash/socket.io': { target: 'http://127.0.0.1:5200', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
