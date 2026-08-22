import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
const __dirname = import.meta.dirname;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { fs: { allow: [path.resolve(__dirname, '..')] } },
  resolve: { alias: { '@data': path.resolve(__dirname, '../data'), '@templates': path.resolve(__dirname, '../templates') } },
});
