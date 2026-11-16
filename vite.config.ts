import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 站点发布在 GitHub 用户主页的 /恋爱日志/ 子目录；URL 使用编码形式，
// 避免不同服务器对中文路径的请求编码不一致。
const SITE_BASE = '/%E6%81%8B%E7%88%B1%E6%97%A5%E5%BF%97/'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? SITE_BASE : '/',
  build:
    command === 'build'
      ? {
          outDir: 'dist/恋爱日志',
          emptyOutDir: true,
        }
      : undefined,
  server: {
    watch: {
      ignored: ['**/.*.tmpdir/**', '**/*.tmp'],
    },
  },
}))
