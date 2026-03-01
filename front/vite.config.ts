import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/gymtracker/', // GitHub Pages путь для репозитория gymtracker
})