import { it, expect, vi, afterEach } from 'vitest';
import type { PeerMessage, StripSettings } from '@twogether/protocol';
import { ClockSync, CaptureGate, canCapture, captureTargets, validTarget } from './capture-plan';
import { Capture } from './capture';
import type { DataLink } from './transfer';
afterEach(() => vi.useRealTimers());
it('estimates clock offset from the lowest RTT and ignores invalid samples', () => {
  const sync = new ClockSync();
  sync.add(1000, 6100, 1200);
  sync.add(2000, 7020, 2040);
  sync.add(3000, 8040, 3080);
  sync.add(5, 10, 4);
  expect(sync.ready).toBe(true);
  expect(sync.offset).toBe(5000);
  expect(sync.uncertainty).toBe(20);
  expect(sync.samples).toBe(3);
});
it('uses the same three absolute targets despite a different device clock', () => {
  const host = captureTargets(5000),
    guest = captureTargets(5000 + 12345);
  expect(host).toEqual([5000, 8500, 12000]);
  expect(guest.map((t) => t - 12345)).toEqual(host);
  expect(validTarget(5000, 1000)).toBe(true);
  expect(validTarget(1001, 1000)).toBe(false);
});
it('prevents overlapping sessions and stale capture IDs', () => {
  const gate = new CaptureGate();
  gate.begin('first');
  expect(() => gate.begin('second')).toThrow();
  expect(gate.matches('second')).toBe(false);
  gate.end();
  gate.begin('second');
  expect(gate.matches('second')).toBe(true);
  expect(canCapture(true, true, true, false, true)).toBe(true);
  for (const args of [
    [false, true, true, false, true],
    [true, false, true, false, true],
    [true, true, false, false, true],
    [true, true, true, true, true],
    [true, true, true, false, false],
  ])
    expect(canCapture(...(args as [boolean, boolean, boolean, boolean, boolean]))).toBe(false);
});
function harness(host: boolean) {
  const messages: PeerMessage[] = [],
    snap = vi.fn(async () => new Blob(['photo'], { type: 'image/jpeg' })),
    progress = vi.fn(),
    result = vi.fn(),
    error = vi.fn();
  const link = {
    open: true,
    send: (m: PeerMessage) => messages.push(m),
    sendFile: vi.fn(async () => {}),
    clearTransfers: vi.fn(),
  } as unknown as DataLink;
  const capture = new Capture(
    host,
    link,
    snap,
    () => true,
    progress,
    result,
    error,
    () => {},
  );
  return { capture, messages, snap, error, link };
}
const settings: StripSettings = { frame: 'cream', names: '', caption: '', date: '' };
it('does not take photos before both devices confirm the target, then captures three local poses', async () => {
  vi.useFakeTimers();
  const { capture, messages, snap } = harness(true);
  for (let i = 0; i < 3; i++) capture.clock.add(0, 0, 0);
  capture.start(settings);
  const prepare = messages.find((m) => m.type === 'prepare');
  if (prepare?.type !== 'prepare') throw new Error();
  await vi.advanceTimersByTimeAsync(1000);
  expect(snap).not.toHaveBeenCalled();
  capture.handle({ type: 'accept', id: prepare.id });
  expect(messages.some((m) => m.type === 'commit')).toBe(true);
  await vi.advanceTimersByTimeAsync(11_000);
  expect(snap).toHaveBeenCalledTimes(3);
  capture.close();
});
it('cancels an unconfirmed capture and clears all snapshot timers', async () => {
  vi.useFakeTimers();
  const { capture, snap, error } = harness(true);
  for (let i = 0; i < 3; i++) capture.clock.add(0, 0, 0);
  capture.start(settings);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(capture.busy).toBe(false);
  expect(snap).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalledWith(expect.stringContaining('confirmed'));
  capture.close();
  expect(vi.getTimerCount()).toBe(0);
});
it('rejects late guest targets and ignores commits for a different capture', async () => {
  vi.useFakeTimers();
  const { capture, messages, snap } = harness(false);
  capture.handle({
    type: 'prepare',
    id: crypto.randomUUID(),
    target: performance.now() + 50,
    settings,
  });
  expect(messages.at(-1)?.type).toBe('cancel');
  const id = crypto.randomUUID();
  capture.handle({ type: 'prepare', id, target: performance.now() + 4000, settings });
  capture.handle({ type: 'commit', id: crypto.randomUUID() });
  await vi.advanceTimersByTimeAsync(12_000);
  expect(snap).not.toHaveBeenCalled();
  capture.handle({ type: 'cancel', id, reason: 'Partner cancelled' });
  expect(capture.busy).toBe(false);
  capture.close();
});
