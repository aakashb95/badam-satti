import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/kings-corner/',
  plugins: [react()],
  server: {
    proxy: {
      '/kings-corner/socket.io': { target: 'http://localhost:5100', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
