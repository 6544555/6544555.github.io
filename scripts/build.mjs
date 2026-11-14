import { mkdirSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tempDirectory = join(root, '.build-tmp')
const viteEntry = join(root, 'node_modules', 'vite', 'bin', 'vite.js')

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

  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
