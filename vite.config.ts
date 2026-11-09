import path from 'path';
import { defineConfig, loadEnv } from 'vite';


export default defineConfig(({ mode }) => {
    // Secrets live in ./private/.env (git-ignored); a root .env / .env.local still works as before
    const env = { ...loadEnv(mode, '.', ''), ...loadEnv(mode, 'private', '') };
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        // Local development calls the deployed api/* functions (quota, Ko-fi, songs) through this proxy
        proxy: { '/api': { target: env.DEV_API_TARGET || 'https://game-dj.com', changeOrigin: true, cookieDomainRewrite: '' } },
      },
      plugins: [],
      define: {
        // The free key (a project without billing) is the only key in the browser: it serves Lyria RealTime and the
        // cheap text calls. The paid song key (GEMINI_SONG_KEY) stays on the server.
        'import.meta.env.VITE_API_KEY': JSON.stringify(env.GEMINI_LIVE_KEY),
        // Dev server only: lets local songs skip the quota ticket (never part of a production build)
        'import.meta.env.VITE_DEV_SONG_SECRET': JSON.stringify(mode === 'development' ? env.DEV_SONG_SECRET || '' : ''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      // The MP3 export worker (utils/mp3.worker.ts) loads the encoder on demand, so it is built as an ES module
      worker: { format: 'es' },
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              // The MP3 encoder (LGPL-3.0) stays its own file, loaded only when an MP3 is exported
              if (id.includes('@breezystack/lamejs')) return 'lamejs';
              if (id.includes('node_modules')) {
                return 'vendor';
              }
              if (id.includes('components')) {
                return 'components';
              }
            }
          }
        }
      }
    };
});
