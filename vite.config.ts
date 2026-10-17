import {defineConfig} from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  server: {port: 5186, strictPort: true},
  build: {outDir: 'dist', sourcemap: true},
});
