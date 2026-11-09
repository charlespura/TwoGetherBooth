import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { pwa } from './pwa.ts';
export default defineConfig({
  plugins: [react(), tailwind(), pwa()],
  server: { port: 5173, strictPort: true },
});
