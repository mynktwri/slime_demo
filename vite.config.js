import { defineConfig } from 'vite';

export default defineConfig({
  assetsInclude: ['**/*.glsl'],
  server: {
    host: 'localhost',
    port: 5173,
    open: true
  }
});
