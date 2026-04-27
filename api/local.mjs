/**
 * Local-dev shim around the Lambda handler.
 *
 *   cd api && node local.mjs                 # listens on :3001
 *
 * Pair with the Vite dev server:
 *   cd landing && API_TARGET=http://localhost:3001 npm run dev
 *
 * Reads env vars from process.env. To populate them, either:
 *   • run with `env $(cat .env | xargs) node local.mjs`
 *   • or `source .env && node local.mjs`
 *   • or set them in your shell.
 *
 * Required env (same as the deployed Lambda):
 *   TINYFISH_API_KEY, REDIS_URL, VAPI_PRIVATE_KEY, X402_PAYMENT_ADDRESS
 */
import { createServer } from 'node:http'
import { handler } from './src/index.mjs'

const PORT = parseInt(process.env.PORT || '3001', 10)

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const body = (req.method === 'GET' || req.method === 'HEAD') ? '' : await readBody(req)

  const event = {
    version: '2.0',
    rawPath: url.pathname,
    rawQueryString: url.search.replace(/^\?/, ''),
    queryStringParameters: Object.fromEntries(url.searchParams),
    headers: Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(',') : v]),
    ),
    requestContext: {
      http: { method: req.method, path: url.pathname, sourceIp: req.socket.remoteAddress },
    },
    body,
    isBase64Encoded: false,
  }

  const start = Date.now()
  try {
    const result = await handler(event)
    const status = result?.statusCode || 200
    const headers = result?.headers || {}
    res.writeHead(status, headers)
    res.end(result?.body || '')
    console.log(`${req.method} ${url.pathname} → ${status} (${Date.now() - start}ms)`)
  } catch (err) {
    console.error('handler threw:', err)
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: err.message || 'handler error' }))
  }
})

server.listen(PORT, () => {
  console.log(`bnbmesh-api local: http://localhost:${PORT}`)
  console.log(`integrations: tinyfish=${!!process.env.TINYFISH_API_KEY} redis=${!!process.env.REDIS_URL} vapi=${!!process.env.VAPI_PRIVATE_KEY}`)
})
