import { defineConfig } from 'vite';
const headers = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' };
export default defineConfig({
  base: './',
  worker: { format: 'es' },
  server: { headers },
  preview: { headers },
  build: {
    rolldownOptions: {
      input: { demo: 'index.html', sidekick: 'src/index.ts', performance: 'performance.html' },
      output: { entryFileNames: chunk => chunk.name === 'sidekick' ? 'sidekick.js' : 'assets/[name]-[hash].js' },
      preserveEntrySignatures: 'strict',
    },
  },
});
