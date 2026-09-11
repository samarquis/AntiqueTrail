/* global Buffer, process, setTimeout, clearTimeout */
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import fs from 'node:fs'
import { command } from './configured-shopper-local.mjs'

// Supabase 2.115 leaves HostIp empty. Apply loopback at container creation,
// before any service starts, without changing the shared Docker daemon.
export function bindLoopback(body, projectId) {
  if (body.Labels?.['com.supabase.cli.project'] !== projectId)
    throw new Error('Foreign container creation refused')
  for (const bindings of Object.values(body.HostConfig?.PortBindings ?? {}))
    for (const binding of bindings) binding.HostIp = '127.0.0.1'
  return body
}
export async function dockerLoopbackProxy(run) {
  const context = JSON.parse(await command('docker', ['context', 'inspect']))[0]
  const host = process.env.DOCKER_HOST ?? context.Endpoints?.docker?.Host
  const upstream = host?.startsWith('npipe:')
    ? '\\\\.\\pipe\\' + host.split('/').at(-1)
    : host?.startsWith('unix:')
      ? host.slice(7)
      : null
  if (!upstream) throw new Error('A local Docker socket is required')
  return serveDockerProxy(run, upstream)
}
export async function serveDockerProxy(run, upstream) {
  const socket =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\${run.projectId}`
      : path.join(run.directory, 'docker.sock')
  const server = http.createServer(async (req, res) => {
    try {
      let payload
      if (req.method === 'POST' && /^\/(?:v[\d.]+\/)?containers\/create(?:\?|$)/.test(req.url)) {
        const parts = []
        for await (const part of req) {
          parts.push(part)
          if (parts.reduce((n, p) => n + p.length, 0) > 2_000_000)
            throw new Error('Oversized container request')
        }
        payload = Buffer.from(
          JSON.stringify(bindLoopback(JSON.parse(Buffer.concat(parts)), run.projectId)),
        )
      }
      const headers = { ...req.headers }
      if (payload) {
        headers['content-length'] = String(payload.length)
        delete headers['transfer-encoding']
      }
      const proxy = http.request(
        { socketPath: upstream, path: req.url, method: req.method, headers, agent: false },
        (reply) => {
          res.writeHead(reply.statusCode, reply.headers)
          res.flushHeaders()
          reply.pipe(res)
        },
      )
      proxy.on('error', () => {
        if (!res.headersSent) res.writeHead(502)
        res.end()
      })
      res.on('close', () => proxy.destroy())
      if (payload) proxy.end(payload)
      else req.pipe(proxy)
    } catch {
      res.writeHead(403)
      res.end('{"message":"Local Docker isolation rejected request"}')
    }
  })
  // Docker exec and attach use an HTTP upgrade for streaming command output.
  const sockets = new Set()
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  server.on('upgrade', (req, client, head) => {
    const remote = net.connect(upstream, () => {
      remote.write(
        req.method +
          ' ' +
          req.url +
          ' HTTP/1.1\r\n' +
          req.rawHeaders.reduce(
            (headers, value, index) => headers + value + (index % 2 ? '\r\n' : ': '),
            '',
          ) +
          '\r\n',
      )
      if (head.length) remote.write(head)
      client.pipe(remote)
      remote.pipe(client)
    })
    client.on('error', () => remote.destroy())
    remote.on('error', () => client.destroy())
    client.on('close', () => remote.destroy())
    remote.on('close', () => client.destroy())
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close()
      reject(new Error('Run-owned Docker proxy listener did not become ready'))
    }, 10_000)
    server.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    server.listen(socket, () => {
      clearTimeout(timer)
      resolve()
    })
  })
  if (process.platform !== 'win32') fs.chmodSync(socket, 0o600)
  return {
    env: {
      ...process.env,
      DOCKER_HOST:
        process.platform === 'win32' ? `npipe:////./pipe/${run.projectId}` : `unix://${socket}`,
      DOCKER_CONTEXT: '',
    },
    close: async () => {
      for (const socket of sockets) socket.destroy()
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}
