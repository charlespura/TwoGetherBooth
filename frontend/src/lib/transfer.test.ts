import { it, expect, vi } from 'vitest';
import { DataLink } from './transfer';
import type { FileMeta } from '@twogether/protocol';
class Channel extends EventTarget {
  readyState = 'open';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  binaryType = '';
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onopen: (() => void) | null = null;
  sent: (string | ArrayBuffer)[] = [];
  destination: Channel | null = null;
  block = false;
  send(data: string | ArrayBuffer) {
    this.sent.push(data);
    if (this.block && data instanceof ArrayBuffer) this.bufferedAmount = 300_000;
    this.destination?.onmessage?.({ data });
  }
  close() {
    this.readyState = 'closed';
    this.dispatchEvent(new Event('close'));
  }
  drain() {
    this.block = false;
    this.bufferedAmount = 0;
    this.dispatchEvent(new Event('bufferedamountlow'));
  }
}
const asRTC = (c: Channel) => c as unknown as RTCDataChannel;
it('chunks a bounded image and delivers the same verified bytes', async () => {
  const a = new Channel(),
    b = new Channel();
  a.destination = b;
  const sender = new DataLink(asRTC(a)),
    receiver = new DataLink(asRTC(b));
  receiver.acceptFile = () => true;
  const result = vi.fn(),
    error = vi.fn();
  receiver.onFile = result;
  receiver.onError = error;
  const bytes = crypto.getRandomValues(new Uint8Array(60_000)),
    blob = new Blob([bytes], { type: 'image/jpeg' });
  await sender.sendFile(blob, { captureId: crypto.randomUUID(), kind: 'pose', pose: 1 });
  await vi.waitFor(() => expect(result).toHaveBeenCalledTimes(1));
  expect(new Uint8Array(await (result.mock.calls[0][1] as Blob).arrayBuffer())).toEqual(bytes);
  const chunks = a.sent.filter((x) => x instanceof ArrayBuffer);
  expect(chunks.length).toBe(4);
  expect(chunks.every((x) => x.byteLength <= 16_384)).toBe(true);
  expect(error).not.toHaveBeenCalled();
  sender.close();
  receiver.close();
});
it('pauses for buffered-amount backpressure before sending more chunks', async () => {
  const channel = new Channel();
  channel.block = true;
  const sender = new DataLink(asRTC(channel));
  const sending = sender.sendFile(new Blob([new Uint8Array(50_000)], { type: 'image/jpeg' }), {
    captureId: crypto.randomUUID(),
    kind: 'pose',
    pose: 0,
  });
  await vi.waitFor(() =>
    expect(channel.sent.filter((x) => x instanceof ArrayBuffer).length).toBe(1),
  );
  channel.drain();
  await sending;
  expect(channel.sent.filter((x) => x instanceof ArrayBuffer).length).toBe(4);
  sender.close();
});
it('rejects unexpected or oversized transfers before allocating image buffers', async () => {
  const c = new Channel(),
    link = new DataLink(asRTC(c)),
    error = vi.fn();
  link.onError = error;
  const meta: FileMeta = {
    type: 'file-start',
    id: crypto.randomUUID(),
    captureId: crypto.randomUUID(),
    kind: 'pose',
    pose: 0,
    size: 240_001,
    mime: 'image/jpeg',
    hash: 'a'.repeat(64),
  };
  link.acceptFile = () => true;
  c.onmessage?.({ data: JSON.stringify(meta) });
  await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
  link.close();
});
it('rejects corruption instead of presenting a different photo', async () => {
  const a = new Channel(),
    b = new Channel();
  a.destination = b;
  const sender = new DataLink(asRTC(a)),
    receiver = new DataLink(asRTC(b));
  receiver.acceptFile = () => true;
  const error = vi.fn(),
    result = vi.fn();
  receiver.onError = error;
  receiver.onFile = result;
  const original = a.send.bind(a);
  a.send = (data) =>
    original(data instanceof ArrayBuffer ? new Uint8Array(data.byteLength).fill(42).buffer : data);
  await sender.sendFile(new Blob(['original'], { type: 'image/jpeg' }), {
    captureId: crypto.randomUUID(),
    kind: 'pose',
    pose: 0,
  });
  await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
  expect(result).not.toHaveBeenCalled();
  sender.close();
  receiver.close();
});
