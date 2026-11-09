import { describe, it, expect } from 'vitest';
import { RoomStore, type Endpoint } from './rooms';
import type { ServerSignal, Membership } from '@twogether/protocol';
class Socket implements Endpoint {
  messages: ServerSignal[] = [];
  closed = false;
  send(m: ServerSignal) {
    this.messages.push(m);
  }
  close() {
    this.closed = true;
  }
  get joined() {
    return this.messages.find((m) => m.type === 'joined') as Membership & { type: 'joined' };
  }
  get error() {
    return this.messages.filter((m) => m.type === 'error').at(-1);
  }
}
function setup() {
  let time = 1000;
  const store = new RoomStore(
      () => [],
      () => time,
      100_000,
      30_000,
    ),
    host = new Socket();
  store.handle(host, { type: 'create', name: 'Host' });
  return {
    store,
    host,
    room: host.joined.room,
    advance: (ms: number) => {
      time += ms;
      store.sweep();
    },
  };
}
function request(store: RoomStore, host: Socket, room: string, guest = new Socket()) {
  store.handle(guest, { type: 'join', room, name: 'Guest' });
  const m = host.messages.filter((m) => m.type === 'join-request').at(-1);
  if (m?.type !== 'join-request') throw new Error('No request');
  return { guest, id: m.requestId };
}
describe('temporary room access', () => {
  it('uses unguessable tokens and requires host approval before relaying', () => {
    const { store, host, room } = setup();
    expect(room).toMatch(/^[\w-]{32}$/);
    const { guest } = request(store, host, room);
    expect(guest.joined).toBeUndefined();
    store.handle(guest, {
      type: 'signal',
      payload: { kind: 'description', description: { type: 'offer', sdp: 'private' } },
    });
    expect(guest.error?.code).toBe('forbidden');
    expect(host.messages.some((m) => m.type === 'signal')).toBe(false);
  });
  it('only permits the host to approve and reserves one guest seat', () => {
    const { store, host, room } = setup();
    const { guest, id } = request(store, host, room);
    store.handle(guest, { type: 'approve', requestId: id, allow: true });
    expect(guest.error?.code).toBe('forbidden');
    const third = new Socket();
    store.handle(third, { type: 'join', room, name: 'Third' });
    expect(third.error?.code).toBe('full');
    store.handle(host, { type: 'approve', requestId: id, allow: true });
    expect(guest.joined.role).toBe('guest');
    store.handle(third, { type: 'join', room, name: 'Third' });
    expect(third.error?.code).toBe('full');
  });
  it('rejects a request without disclosing the host resume credential', () => {
    const { store, host, room } = setup();
    const { guest, id } = request(store, host, room);
    store.handle(host, { type: 'approve', requestId: id, allow: false });
    expect(guest.error?.code).toBe('declined');
    expect(JSON.stringify(guest.messages)).not.toContain(host.joined.key);
  });
  it('expires pending requests and releases abandoned seats', () => {
    const { store, host, room, advance } = setup();
    const { guest } = request(store, host, room);
    advance(45_001);
    expect(guest.error?.code).toBe('approval-timeout');
    const { guest: next, id } = request(store, host, room);
    store.handle(host, { type: 'approve', requestId: id, allow: true });
    store.detach(next);
    advance(30_001);
    expect(host.messages.at(-1)?.type).toBe('peer-left');
    expect(() => request(store, host, room)).not.toThrow();
  });
  it('resumes with the same secret within grace, but rejects impostors', () => {
    const { store, host, room } = setup();
    const { guest, id } = request(store, host, room);
    store.handle(host, { type: 'approve', requestId: id, allow: true });
    const credentials = guest.joined;
    store.detach(guest);
    const intruder = new Socket();
    store.handle(intruder, {
      type: 'resume',
      room,
      peerId: credentials.peerId,
      key: host.joined.key,
    });
    expect(intruder.error?.code).toBe('resume-failed');
    const reconnected = new Socket();
    store.handle(reconnected, {
      type: 'resume',
      room,
      peerId: credentials.peerId,
      key: credentials.key,
    });
    expect(reconnected.joined.peerId).toBe(credentials.peerId);
    expect(host.messages.at(-1)?.type).toBe('peer-ready');
  });
  it('cleans up when the host leaves, disconnects beyond grace, or TTL expires', () => {
    for (const mode of ['leave', 'grace', 'ttl']) {
      const { store, host, room, advance } = setup();
      const { guest, id } = request(store, host, room);
      store.handle(host, { type: 'approve', requestId: id, allow: true });
      if (mode === 'leave') store.handle(host, { type: 'leave' });
      if (mode === 'grace') {
        store.detach(host);
        advance(30_001);
      }
      if (mode === 'ttl') advance(100_001);
      expect(store.rooms.size).toBe(0);
      expect(guest.closed).toBe(true);
      expect(guest.messages.at(-1)?.type).toBe('room-expired');
    }
  });
  it('removes a disconnected pending request immediately', () => {
    const { store, host, room } = setup();
    const { guest } = request(store, host, room);
    store.detach(guest);
    expect(host.messages.at(-1)?.type).toBe('request-gone');
    expect(() => request(store, host, room)).not.toThrow();
  });
});
