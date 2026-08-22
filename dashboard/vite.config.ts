import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readAuthUrl } from './src/lib/authUrl.ts'

const devServerHost = process.env.HOST || undefined
const devServerPort = Number(process.env.PORT ?? 4177)

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const environment = loadEnv(mode, '..', '')
    readAuthUrl(
      process.env.VITE_AUTH_URL || environment.VITE_AUTH_URL,
      true,
    )
  }

  return {
    envDir: '..',
    plugins: [tailwindcss(), react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (
              id.includes('@headlessui') ||
              id.includes('lucide-react') ||
              id.includes('motion')
            ) {
              return 'ui-vendor'
            }
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router/') ||
              id.includes('/react-router-dom/') ||
              id.includes('/scheduler/') ||
              id.includes('@tanstack')
            ) {
              return 'react-vendor'
            }
            return undefined
          }
        },
      },
    },
    server: {
      host: devServerHost,
      port: devServerPort,
      strictPort: true,
    },
  }
})
