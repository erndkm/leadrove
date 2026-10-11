import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { localAudits } from './server/vite-plugin.mjs';
export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const env = loadEnv(mode, root, '');
  const overpassEndpoints = env.VITE_OVERPASS_URL?.trim()
    ? [env.VITE_OVERPASS_URL.trim(), ...(env.VITE_OVERPASS_FALLBACK_URLS || '').split(',').map(url => url.trim()).filter(Boolean)]
    : undefined;
  return {
    plugins: [react(), localAudits({ overpassEndpoints })],
    server: {
      port: 5173,
      strictPort: true,
      fs: { allow: [root, fileURLToPath(new URL('../shared', import.meta.url))] },
    },
    build: { rollupOptions: { output: { manualChunks: { map: ['leaflet', 'maplibre-gl', '@maplibre/maplibre-gl-leaflet'] } } } },
  };
});
