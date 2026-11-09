import { peerSchema, type PeerMessage, type FileMeta } from '@twogether/protocol';
const CHUNK = 16_384,
  HIGH = 262_144,
  LOW = 65_536;
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
export async function digest(blob: Blob) {
  return hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
}
type Incoming = {
  meta: FileMeta;
  chunks: ArrayBuffer[];
  bytes: number;
  timer: ReturnType<typeof setTimeout>;
};
export class DataLink {
  onMessage: (m: PeerMessage) => void = () => {};
  onFile: (m: FileMeta, blob: Blob) => void = () => {};
  acceptFile: (m: FileMeta) => boolean = () => false;
  onError: (error: string) => void = () => {};
  onProgress: (fraction: number) => void = () => {};
  private incoming: Incoming | null = null;
  private queue: Promise<void> = Promise.resolve();
  private generation = 0;
  constructor(private channel: RTCDataChannel) {
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = LOW;
    channel.onmessage = (e) => {
      void this.receive(e.data).catch(() =>
        this.fail('The photo transfer was invalid. Please retake.'),
      );
    };
  }
  get open() {
    return this.channel.readyState === 'open';
  }
  send(m: PeerMessage) {
    if (!this.open) throw new Error('The photo connection is closed.');
    this.channel.send(JSON.stringify(m));
  }
  private fail(s: string) {
    this.clearTransfers();
    this.onError(s);
  }
  private async receive(data: unknown) {
    if (typeof data === 'string') {
      if (data.length > 24_000) throw new Error('Oversized control');
      const m = peerSchema.parse(JSON.parse(data));
      if (m.type === 'file-start') {
        if (
          this.incoming ||
          !this.acceptFile(m) ||
          (m.kind === 'pose' && (m.size > 240_000 || m.mime !== 'image/jpeg')) ||
          (m.kind === 'result' && m.mime !== 'image/png')
        )
          throw new Error('Unexpected image');
        this.incoming = {
          meta: m,
          chunks: [],
          bytes: 0,
          timer: setTimeout(
            () => this.fail('The photo transfer timed out. Please retake.'),
            25_000,
          ),
        };
      } else if (m.type === 'file-end') {
        const current = this.incoming;
        if (!current || current.meta.id !== m.id || current.bytes !== current.meta.size)
          throw new Error('Incomplete image');
        clearTimeout(current.timer);
        this.incoming = null;
        const generation = this.generation;
        const blob = new Blob(current.chunks, { type: current.meta.mime });
        if ((await digest(blob)) !== current.meta.hash) throw new Error('Image checksum failed');
        if (generation === this.generation) this.onFile(current.meta, blob);
      } else this.onMessage(m);
    } else {
      if (!(data instanceof ArrayBuffer) || data.byteLength > CHUNK || !this.incoming)
        throw new Error('Unexpected binary');
      const f = this.incoming;
      f.bytes += data.byteLength;
      if (f.bytes > f.meta.size) throw new Error('Image too large');
      f.chunks.push(data);
      this.onProgress(f.bytes / f.meta.size);
    }
  }
  private async drain() {
    if (!this.open) throw new Error('Photo connection closed.');
    if (this.channel.bufferedAmount <= HIGH) return;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.channel.removeEventListener('bufferedamountlow', low);
        this.channel.removeEventListener('close', closed);
      };
      const low = () => {
          cleanup();
          resolve();
        },
        closed = () => {
          cleanup();
          reject(new Error('Photo connection closed.'));
        };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Photo transfer stalled.'));
      }, 12_000);
      this.channel.addEventListener('bufferedamountlow', low);
      this.channel.addEventListener('close', closed);
      if (this.channel.bufferedAmount <= LOW) low();
    });
  }
  sendFile(blob: Blob, meta: Pick<FileMeta, 'captureId' | 'kind' | 'pose'>) {
    const generation = this.generation;
    const task = async () => {
      if (blob.size > 3_500_000) throw new Error('The final image is too large.');
      const hash = await digest(blob);
      const bytes = await blob.arrayBuffer();
      if (generation !== this.generation) throw new Error('Transfer cancelled.');
      const id = crypto.randomUUID();
      await this.drain();
      this.send({
        type: 'file-start',
        id,
        ...meta,
        size: blob.size,
        mime: blob.type as FileMeta['mime'],
        hash,
      });
      for (let offset = 0; offset < bytes.byteLength; offset += CHUNK) {
        await this.drain();
        if (generation !== this.generation) throw new Error('Transfer cancelled.');
        this.channel.send(bytes.slice(offset, offset + CHUNK));
        this.onProgress(Math.min(1, (offset + CHUNK) / bytes.byteLength));
      }
      this.send({ type: 'file-end', id });
    };
    const result = this.queue.then(task);
    this.queue = result.catch(() => {});
    return result;
  }
  clearTransfers() {
    this.generation++;
    if (this.incoming) clearTimeout(this.incoming.timer);
    this.incoming = null;
  }
  close() {
    this.clearTransfers();
    this.channel.onmessage = null;
    this.channel.onopen = null;
    this.channel.close();
    this.onMessage = () => {};
    this.onFile = () => {};
  }
}
