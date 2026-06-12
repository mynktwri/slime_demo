import { defineConfig } from 'vite';

export default defineConfig({
  base: '/slime_demo/',
  server: {
    host: 'localhost',
    port: 5173,
    open: true
  }
});
