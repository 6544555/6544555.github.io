import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tempDirectory = join(root, '.build-tmp')
const distDirectory = join(root, 'dist')
const viteEntry = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const sitePath = '/%E6%81%8B%E7%88%B1%E6%97%A5%E5%BF%97/'

rmSync(distDirectory, { recursive: true, force: true })
mkdirSync(tempDirectory, { recursive: true })

const child = spawn(process.execPath, [viteEntry, 'build', ...process.argv.slice(2)], {
  cwd: root,
  env: {
    ...process.env,
    TEMP: tempDirectory,
    TMP: tempDirectory,
  },
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  try {
    rmSync(tempDirectory, { recursive: true, force: true })
  } catch {
    // A later build can reuse the ignored directory if Windows still holds a handle.
  }

  if (code === 0) {
    const redirect = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0;url=${sitePath}">
    <link rel="canonical" href="${sitePath}">
    <title>恋爱日志</title>
  </head>
  <body><a href="${sitePath}">进入恋爱日志</a></body>
</html>
`
    writeFileSync(join(distDirectory, 'index.html'), redirect)
  }

  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
