import path from 'path';
import { defineConfig, loadEnv } from 'vite';


export default defineConfig(({ mode }) => {
    // Secrets live in ./private/.env (git-ignored); a root .env / .env.local still works as before
    const env = { ...loadEnv(mode, '.', ''), ...loadEnv(mode, 'private', '') };
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [],
      define: {
        'import.meta.env.VITE_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
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
