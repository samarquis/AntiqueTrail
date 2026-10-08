/* global Buffer, process */
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
function edgeVolumeCreateResult(status, message = '') {
  const normalized = message.toLowerCase()
  const outcome =
    status >= 200 && status < 300
      ? 'accepted'
      : /already exists/.test(normalized)
        ? 'already-exists'
        : /permission|denied|forbidden/.test(normalized)
          ? 'permission-denied'
          : /no space|quota/.test(normalized)
            ? 'capacity'
            : /invalid|malformed|bad request/.test(normalized)
              ? 'invalid-request'
              : status === 409
                ? 'conflict'
                : status >= 500
                  ? 'server-error'
                  : status >= 400
                    ? 'request-rejected'
                    : 'unknown'
  return {
    status: Number.isInteger(status) ? status : null,
    outcome,
    ...(outcome === 'already-exists'
      ? { cliSubstringRecognized: message.includes('already exists') }
      : {}),
  }
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
  run.edgeVolumeCreateResults ??= []
  const expectedVolumeName = `supabase_edge_runtime_${run.projectId}`
  const socket =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\${run.projectId}`
      : path.join(run.directory, 'docker.sock')
  const server = http.createServer(async (req, res) => {
    let inspectEdgeVolumeCreate = false
    try {
      let payload
      const containerCreate =
        req.method === 'POST' && /^\/(?:v[\d.]+\/)?containers\/create(?:\?|$)/.test(req.url)
      const volumeCreate =
        req.method === 'POST' && /^\/(?:v[\d.]+\/)?volumes\/create(?:\?|$)/.test(req.url)
      if (containerCreate || volumeCreate) {
        const parts = []
        let size = 0
        for await (const part of req) {
          parts.push(part)
          size += part.length
          if (size > 2_000_000) throw new Error('Oversized Docker request')
        }
        const requestBody = Buffer.concat(parts)
        if (containerCreate)
          payload = Buffer.from(
            JSON.stringify(bindLoopback(JSON.parse(requestBody), run.projectId)),
          )
        else {
          payload = requestBody
          try {
            const volume = JSON.parse(requestBody)
            inspectEdgeVolumeCreate =
              volume.Name === expectedVolumeName &&
              volume.Labels?.['com.supabase.cli.project'] === run.projectId &&
              volume.Labels?.['com.docker.compose.project'] === run.projectId
          } catch {
            /* Keep forwarding the original Docker request unchanged. */
          }
        }
      }
      const headers = { ...req.headers }
      if (payload) {
        headers['content-length'] = String(payload.length)
        delete headers['transfer-encoding']
      }
      const proxy = http.request(
        { socketPath: upstream, path: req.url, method: req.method, headers, agent: false },
        (reply) => {
          if (inspectEdgeVolumeCreate) {
            const parts = []
            let size = 0
            reply.on('data', (part) => {
              if (size < 4096) {
                const safePart = part.subarray(0, 4096 - size)
                parts.push(safePart)
                size += safePart.length
              }
            })
            reply.once('end', () => {
              let message = ''
              try {
                const body = JSON.parse(Buffer.concat(parts).toString('utf8'))
                if (typeof body?.message === 'string') message = body.message.slice(0, 4096)
              } catch {
                /* Outcome falls back to the fixed HTTP status category. */
              }
              if (run.edgeVolumeCreateResults.length < 4)
                run.edgeVolumeCreateResults.push(edgeVolumeCreateResult(reply.statusCode, message))
            })
          }
          res.writeHead(reply.statusCode, reply.headers)
          res.flushHeaders()
          reply.pipe(res)
        },
      )
      proxy.on('error', () => {
        if (inspectEdgeVolumeCreate && run.edgeVolumeCreateResults.length < 4)
          run.edgeVolumeCreateResults.push(edgeVolumeCreateResult(null))
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
    server.once('error', reject)
    server.listen(socket, resolve)
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
