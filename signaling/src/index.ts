import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { signalSchema } from '@twogether/protocol';
import { RoomStore, type Endpoint } from './rooms.js';
import { RateLimit } from './rate-limit.js';
import { iceServers } from './ice.js';

const origins = new Set(
  (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((x) => x.trim()),
);
if (origins.has('*')) throw new Error('ALLOWED_ORIGINS must contain exact origins, never *.');
if (Boolean(process.env.TURN_URLS) !== Boolean(process.env.TURN_SHARED_SECRET))
  throw new Error('Set both TURN_URLS and TURN_SHARED_SECRET.');
if (
  process.env.TURN_TTL_SECONDS &&
  (!Number.isInteger(Number(process.env.TURN_TTL_SECONDS)) ||
    Number(process.env.TURN_TTL_SECONDS) < 7200 ||
    Number(process.env.TURN_TTL_SECONDS) > 86400)
)
  throw new Error('TURN_TTL_SECONDS must be 7200–86400.');
const store = new RoomStore(() => iceServers());
const connections = new RateLimit(60, 60_000),
  creates = new RateLimit(12, 600_000),
  joins = new RateLimit(40, 600_000);
const http = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.writeHead(req.url === '/health' ? 200 : 404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: req.url === '/health' }));
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 32_768, perMessageDeflate: false });
http.on('upgrade', (req, socket, head) => {
  const ip =
    process.env.TRUST_PROXY === 'true'
      ? String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress)
          .split(',')[0]
          .trim()
      : (req.socket.remoteAddress ?? 'unknown');
  if (
    req.url !== '/ws' ||
    !origins.has(req.headers.origin ?? '') ||
    wss.clients.size >= 500 ||
    !connections.take(ip)
  ) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const endpoint: Endpoint = {
      send: (m) => {
        if (ws.readyState === WebSocket.OPEN) {
          if (ws.bufferedAmount > 128_000) {
            ws.close(1008, 'Slow connection');
            return;
          }
          ws.send(JSON.stringify(m));
        }
      },
      close: () => ws.close(1000),
    };
    const messages = new RateLimit(160, 10_000);
    let alive = true;
    ws.on('pong', () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, 15_000);
    ws.on('error', () => {
      /* Never log frames, SDP, room tokens, or client addresses. */
    });
    ws.on('message', (data, isBinary) => {
      if (isBinary || !messages.take('socket')) {
        ws.close(1008, 'Message limit');
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        ws.close(1008, 'Invalid JSON');
        return;
      }
      const result = signalSchema.safeParse(parsed);
      if (!result.success) {
        ws.close(1008, 'Invalid message');
        return;
      }
      const m = result.data;
      if ((m.type === 'create' && !creates.take(ip)) || (m.type === 'join' && !joins.take(ip))) {
        endpoint.send({
          type: 'error',
          code: 'rate-limit',
          message: 'Too many attempts. Please wait ten minutes before trying again.',
        });
        return;
      }
      store.handle(endpoint, m);
    });
    ws.on('close', () => {
      clearInterval(heartbeat);
      store.detach(endpoint);
    });
  });
});
const sweep = setInterval(() => {
  store.sweep();
  connections.sweep();
  creates.sweep();
  joins.sweep();
}, 5000);
const port = Number(process.env.PORT ?? 8787);
http.listen(port, '0.0.0.0', () =>
  console.info(`TwoGether signaling listening on port ${port}. Media is never stored here.`),
);
const shutdown = () => {
  clearInterval(sweep);
  store.close();
  for (const ws of wss.clients) ws.terminate();
  wss.close();
  http.close();
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
