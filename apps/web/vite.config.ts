import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Split vendor code into separate chunks so the main bundle stays lean
        manualChunks(id: string) {
          if (
            id.includes('@langchain/core') ||
            id.includes('@langchain/openai') ||
            id.includes('@langchain/google-genai')
          ) return 'vendor-langchain';
          if (id.includes('react-syntax-highlighter')) return 'vendor-highlight';
          if (id.includes('/acorn')) return 'vendor-acorn';
        },
      },
    },
  },
});
