import type { ClientSignal, Membership, ServerSignal } from '@twogether/protocol';
export class Signaling {
  membership: Membership | null = null;
  private ws: WebSocket | null = null;
  private stopped = false;
  private attempt = 0;
  private reconnectUntil = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  constructor(
    private initial: ClientSignal,
    private event: (m: ServerSignal) => void,
    private status: (s: string) => void,
  ) {}
  connect() {
    this.stopped = false;
    const configured = import.meta.env.VITE_SIGNAL_URL as string | undefined;
    if (!configured && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      this.event({
        type: 'error',
        code: 'configuration',
        message:
          'Live booths aren’t available yet. You can watch the demo from the home page.',
      });
      return;
    }
    let url: URL;
    try {
      url = new URL(configured ?? 'ws://localhost:8787');
    } catch {
      this.event({
        type: 'error',
        code: 'configuration',
        message: 'The booth connection is unavailable. Please try again later.',
      });
      return;
    }
    url.pathname = '/ws';
    url.search = '';
    url.hash = '';
    if (
      !['ws:', 'wss:'].includes(url.protocol) ||
      (location.protocol === 'https:' && url.protocol !== 'wss:')
    ) {
      this.event({
        type: 'error',
        code: 'configuration',
        message: 'The booth could not connect securely. Please try again later.',
      });
      return;
    }
    this.status(this.membership ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(url);
    this.ws = ws;
    this.timeout = setTimeout(
      () => ws.close(),
      this.reconnectUntil
        ? Math.max(1, Math.min(12_000, this.reconnectUntil - Date.now()))
        : 12_000,
    );
    ws.onopen = () => {
      clearTimeout(this.timeout);
      this.send(
        this.membership
          ? {
              type: 'resume',
              room: this.membership.room,
              peerId: this.membership.peerId,
              key: this.membership.key,
            }
          : this.initial,
      );
      this.heartbeat = setInterval(() => this.send({ type: 'ping' }), 10_000);
    };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string' || e.data.length > 40_000) return;
      let m: ServerSignal;
      try {
        m = JSON.parse(e.data) as ServerSignal;
      } catch {
        return;
      }
      if (m.type === 'joined') {
        this.membership = m;
        this.attempt = 0;
        this.reconnectUntil = 0;
        this.status('waiting');
      }
      if (m.type === 'error' || m.type === 'room-expired') {
        this.stopped = true;
        clearInterval(this.heartbeat);
        ws.close();
      }
      this.event(m);
    };
    ws.onerror = () => {
      /* onclose supplies an actionable, payload-free error. */
    };
    ws.onclose = () => {
      clearTimeout(this.timeout);
      clearInterval(this.heartbeat);
      if (this.stopped) return;
      this.status('reconnecting');
      if (!this.reconnectUntil) this.reconnectUntil = Date.now() + 27_000;
      if (!this.membership || this.attempt >= 4 || Date.now() >= this.reconnectUntil) {
        this.event({
          type: 'error',
          code: 'connection',
          message:
            'Couldn’t connect to the booth. Check your internet connection and retry. If the booth has ended, create a new one.',
        });
        return;
      }
      this.timer = setTimeout(() => this.connect(), Math.min(1000 * 2 ** this.attempt++, 8000));
    };
  }
  send(message: ClientSignal) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }
  retry() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.timeout);
    clearInterval(this.heartbeat);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.attempt = 0;
    this.reconnectUntil = Date.now() + 27_000;
    this.timer = setTimeout(() => this.connect(), 750);
  }
  close() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.timeout);
    clearInterval(this.heartbeat);
    this.send({ type: 'leave' });
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.close();
    }
    this.membership = null;
  }
}
