import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base tương đối để chạy được trên GitHub Pages (/ui-layout-studio/) và mở cục bộ
export default defineConfig({
  base: './',
  plugins: [react()],
})
