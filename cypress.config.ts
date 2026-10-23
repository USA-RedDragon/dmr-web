import { defineConfig } from 'cypress'

export default defineConfig({
  video: false,
  e2e: {
    specPattern: 'tests/e2e/**/*.{cy,spec}.{js,jsx,ts,tsx}',
    supportFile: false,
    baseUrl: 'http://localhost:4173',
  },
})
