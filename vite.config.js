import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { privacidadPlugin } from './scripts/privacidad.mjs';

// En GitHub Pages la app queda en /<repositorio>/; con dominio propio, en /.
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    privacidadPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      // La política de privacidad es una página aparte: el service worker no la
      // reemplaza por la app.
      workbox: { navigateFallbackDenylist: [/\/privacidad(\.html)?$/] },
      includeAssets: ['escudo.jpg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Jara App · Club Deportivo Hugo Jara',
        short_name: 'Jara App',
        description: 'Partidos, asambleas, cuotas, compras y ministerios del Club Deportivo Hugo Jara.',
        lang: 'es',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#120E0D',
        theme_color: '#120E0D',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
