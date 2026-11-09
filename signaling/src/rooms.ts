import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { ClientSignal, IceServer, Membership, ServerSignal } from '@twogether/protocol';

export interface Endpoint {
  send(message: ServerSignal): void;
  close(): void;
}
type Peer = {
  id: string;
  key: string;
  name: string;
  socket: Endpoint | null;
  detachedAt: number | null;
};
type Pending = { id: string; name: string; socket: Endpoint; createdAt: number };
type Room = { token: string; host: Peer; guest?: Peer; pending?: Pending; expiresAt: number };
const random = () => randomBytes(24).toString('base64url');
const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export class RoomStore {
  readonly rooms = new Map<string, Room>();
  private links = new Map<Endpoint, { room: Room; role: 'host' | 'guest' | 'pending' }>();
  constructor(
    private ice: () => IceServer[],
    private now = Date.now,
    private ttl = 2 * 60 * 60_000,
    private grace = 30_000,
  ) {}
  private error(s: Endpoint, code: string, message: string) {
    s.send({ type: 'error', code, message });
  }
  private peer(name: string, socket: Endpoint): Peer {
    return { id: random(), key: random(), name, socket, detachedAt: null };
  }
  private joined(r: Room, p: Peer, role: Membership['role']) {
    p.socket?.send({
      type: 'joined',
      room: r.token,
      peerId: p.id,
      key: p.key,
      role,
      expiresAt: r.expiresAt,
      iceServers: this.ice(),
    });
  }
  private connect(r: Room) {
    if (r.host.socket && r.guest?.socket) {
      const iceServers = this.ice();
      r.host.socket.send({ type: 'peer-ready', name: r.guest.name, iceServers });
      r.guest.socket.send({ type: 'peer-ready', name: r.host.name, iceServers });
    }
  }
  handle(s: Endpoint, m: ClientSignal) {
    const link = this.links.get(s);
    if (m.type === 'ping') {
      s.send({ type: 'pong' });
      return;
    }
    if (m.type === 'leave') {
      this.detach(s, true);
      return;
    }
    if (m.type === 'create' || m.type === 'join' || m.type === 'resume') {
      if (link) {
        this.error(s, 'already-joined', 'Leave the current booth before opening another.');
        return;
      }
    }
    if (m.type === 'create') {
      if (this.rooms.size >= 1000) {
        this.error(s, 'capacity', 'The booth service is busy. Please try later.');
        return;
      }
      const r: Room = {
        token: random(),
        host: this.peer(m.name, s),
        expiresAt: this.now() + this.ttl,
      };
      this.rooms.set(r.token, r);
      this.links.set(s, { room: r, role: 'host' });
      this.joined(r, r.host, 'host');
      return;
    }
    if (m.type === 'join') {
      const r = this.rooms.get(m.room);
      if (!r || this.now() >= r.expiresAt) {
        this.error(s, 'expired', 'This booth has expired. Ask your person for a new invitation.');
        return;
      }
      if (r.guest || r.pending) {
        this.error(
          s,
          'full',
          'This booth already has two people, or an invitation is being approved.',
        );
        return;
      }
      if (!r.host.socket) {
        this.error(s, 'host-offline', 'The host is reconnecting. Try again in a moment.');
        return;
      }
      r.pending = { id: random(), socket: s, name: m.name, createdAt: this.now() };
      this.links.set(s, { room: r, role: 'pending' });
      s.send({ type: 'waiting' });
      r.host.socket.send({ type: 'join-request', requestId: r.pending.id, name: m.name });
      return;
    }
    if (m.type === 'resume') {
      const r = this.rooms.get(m.room);
      if (!r || this.now() >= r.expiresAt) {
        this.error(s, 'expired', 'This booth has expired. Open a new booth.');
        return;
      }
      const role = r.host.id === m.peerId ? 'host' : 'guest';
      const p = role === 'host' ? r.host : r.guest;
      if (
        !p ||
        p.id !== m.peerId ||
        !equal(p.key, m.key) ||
        p.socket ||
        p.detachedAt === null ||
        this.now() - p.detachedAt >= this.grace
      ) {
        this.error(
          s,
          'resume-failed',
          'The reconnection window has ended. Rejoin using your invitation.',
        );
        return;
      }
      p.socket = s;
      p.detachedAt = null;
      this.links.set(s, { room: r, role });
      this.joined(r, p, role);
      this.connect(r);
      return;
    }
    if (!link) {
      this.error(s, 'not-joined', 'Join a booth first.');
      return;
    }
    const r = link.room;
    if (m.type === 'approve') {
      if (link.role !== 'host') {
        this.error(s, 'forbidden', 'Only the host can approve an invitation.');
        return;
      }
      const pending = r.pending;
      if (!pending || pending.id !== m.requestId) return;
      delete r.pending;
      this.links.delete(pending.socket);
      if (!m.allow) {
        this.error(
          pending.socket,
          'declined',
          'The host declined this request. Check your invitation with them.',
        );
        return;
      }
      r.guest = this.peer(pending.name, pending.socket);
      this.links.set(pending.socket, { room: r, role: 'guest' });
      this.joined(r, r.guest, 'guest');
      this.connect(r);
      return;
    }
    if (m.type === 'signal') {
      if (link.role === 'pending') {
        this.error(s, 'forbidden', 'Wait for host approval before connecting.');
        return;
      }
      const other = link.role === 'host' ? r.guest : r.host;
      if (other?.socket) other.socket.send(m);
    }
  }
  detach(s: Endpoint, explicit = false) {
    const link = this.links.get(s);
    if (!link) return;
    this.links.delete(s);
    const { room: r, role } = link;
    if (role === 'pending') {
      const id = r.pending?.id;
      delete r.pending;
      if (id) r.host.socket?.send({ type: 'request-gone', requestId: id });
      return;
    }
    const p = role === 'host' ? r.host : r.guest;
    if (!p) return;
    p.socket = null;
    p.detachedAt = this.now();
    if (explicit) {
      if (role === 'host') this.expire(r);
      else {
        delete r.guest;
        r.host.socket?.send({ type: 'peer-left' });
      }
    } else (role === 'host' ? r.guest : r.host)?.socket?.send({ type: 'peer-offline' });
  }
  private expire(r: Room) {
    this.rooms.delete(r.token);
    for (const s of [r.host.socket, r.guest?.socket, r.pending?.socket])
      if (s) {
        this.links.delete(s);
        s.send({ type: 'room-expired' });
        s.close();
      }
  }
  sweep() {
    const now = this.now();
    for (const r of this.rooms.values()) {
      if (
        now >= r.expiresAt ||
        (r.host.detachedAt !== null && now - r.host.detachedAt >= this.grace)
      ) {
        this.expire(r);
        continue;
      }
      if (r.pending && now - r.pending.createdAt >= 45_000) {
        const p = r.pending;
        delete r.pending;
        this.links.delete(p.socket);
        this.error(
          p.socket,
          'approval-timeout',
          'The invitation request timed out. Please try joining again.',
        );
        r.host.socket?.send({ type: 'request-gone', requestId: p.id });
      }
      if (
        r.guest?.detachedAt !== null &&
        r.guest?.detachedAt !== undefined &&
        now - r.guest.detachedAt >= this.grace
      ) {
        delete r.guest;
        r.host.socket?.send({ type: 'peer-left' });
      }
    }
  }
  close() {
    for (const r of this.rooms.values()) this.expire(r);
  }
}
