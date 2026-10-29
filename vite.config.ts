import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { emojiFsPlugin } from './vite-plugin-emoji-fs';

export default defineConfig({
  plugins: [react(), tailwindcss(), emojiFsPlugin()],
  server: {
    port: 5173,
    watch: {
      ignored: ['**/emojis/**/exports/**'],
    },
  },
});
