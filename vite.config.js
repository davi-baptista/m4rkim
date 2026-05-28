import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    // Em dev, /api é repassado para o Express em vez de ser servido pelo Vite.
    // Isso evita CORS e permite que o frontend use só '/api/...' sem URL absoluta.
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
