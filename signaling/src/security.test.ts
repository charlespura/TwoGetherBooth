import { it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { signalSchema, peerSchema } from '@twogether/protocol';
import { RateLimit } from './rate-limit';
import { iceServers } from './ice';
it('rejects oversized SDP, invalid room tokens and unbounded images', () => {
  expect(signalSchema.safeParse({ type: 'join', room: 'guessable', name: '' }).success).toBe(false);
  expect(
    signalSchema.safeParse({
      type: 'signal',
      payload: { kind: 'description', description: { type: 'offer', sdp: 'a'.repeat(24_001) } },
    }).success,
  ).toBe(false);
  expect(
    peerSchema.safeParse({
      type: 'file-start',
      id: crypto.randomUUID(),
      captureId: crypto.randomUUID(),
      kind: 'result',
      pose: 0,
      size: 5_000_000,
      mime: 'image/png',
      hash: 'a'.repeat(64),
    }).success,
  ).toBe(false);
});
it('rate limits bursts and releases the bucket after its window', () => {
  let now = 0;
  const limit = new RateLimit(2, 100, () => now);
  expect(limit.take('a')).toBe(true);
  expect(limit.take('a')).toBe(true);
  expect(limit.take('a')).toBe(false);
  expect(limit.take('b')).toBe(true);
  now = 101;
  limit.sweep();
  expect(limit.take('a')).toBe(true);
});
it('generates expiring coturn credentials without returning the shared secret', () => {
  const secret = 'test-only-secret';
  const servers = iceServers(
    {
      STUN_URLS: 'stun:example.org',
      TURN_URLS: 'turn:relay.example.org:3478',
      TURN_SHARED_SECRET: secret,
      TURN_TTL_SECONDS: '10800',
    },
    () => 1000_000,
  );
  const turn = servers[1];
  expect(turn.username?.startsWith('11800:')).toBe(true);
  expect(turn.credential).toBe(createHmac('sha1', secret).update(turn.username!).digest('base64'));
  expect(JSON.stringify(servers)).not.toContain(secret);
});
