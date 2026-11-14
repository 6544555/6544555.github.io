import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 以仓库名作为子路径发布，仓库名暂定 birthday-memory。
// 仅 build 时带上 base，dev 仍用根路径，避免本地调试也要挂子目录。
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/birthday-memory/' : '/',
  server: {
    watch: {
      ignored: ['**/.*.tmpdir/**', '**/*.tmp'],
    },
  },
}))
