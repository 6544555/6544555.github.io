import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'

const root = resolve(process.argv[2] ?? 'dist')
const port = Number(process.argv[3] ?? '4174')
const host = process.argv[4] ?? '127.0.0.1'
const basePath = '/birthday-memory/'

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

function sendFile(response, path, status = 200) {
  response.writeHead(status, {
    'Cache-Control': 'no-cache',
    'Content-Type': mimeTypes[extname(path).toLowerCase()] ?? 'application/octet-stream',
  })
  createReadStream(path).pipe(response)
}

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' })
    response.end()
    return
  }
  if (!pathname.startsWith(basePath)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }

  const relative = decodeURIComponent(pathname.slice(basePath.length)) || 'index.html'
  let filePath = resolve(root, relative)
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    response.writeHead(403)
    response.end()
    return
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = resolve(filePath, 'index.html')
  if (!existsSync(filePath) && !extname(filePath)) filePath = resolve(root, 'index.html')
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }

  sendFile(response, filePath)
})

server.listen(port, host, () => {
  console.log(`Production preview: http://${host}:${port}${basePath}`)
  console.log(`Serving: ${root}`)
})
