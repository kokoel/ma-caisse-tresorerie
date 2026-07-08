import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Atelier Manager',
        short_name: 'Atelier',
        description: 'Gestion de trésorerie, stock et ventes pour ateliers de pâtisserie et petits commerces.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#1A1F16',
        theme_color: '#1A1F16',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Met en cache l'app shell (HTML/JS/CSS/icônes) pour un lancement hors-ligne.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Les appels Supabase (API distante) ne sont jamais mis en cache par le service worker :
        // ils passent par la logique de file d'attente hors-ligne côté app (voir src/lib/offlineQueue.js).
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin.includes('supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
});
