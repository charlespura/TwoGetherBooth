import {
  MAX_POSE_BYTES,
  type PeerMessage,
  type FileMeta,
  type StripSettings,
} from '@twogether/protocol';
import { DataLink } from './transfer';
import { compose } from './render';
import { ClockSync, CaptureGate, captureTargets, validTarget } from './capture-plan';
export type CaptureProgress = {
  busy: boolean;
  phase: string;
  pose: number;
  count: number | null;
  percent: number;
};
type Session = {
  id: string;
  target: number;
  settings: StripSettings;
  own: Map<number, Blob>;
  remote: Map<number, Blob>;
  committed: boolean;
  composing: boolean;
  final?: Blob;
};
export class Capture {
  readonly clock = new ClockSync();
  private gate = new CaptureGate();
  private session: Session | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private ticker: ReturnType<typeof setInterval> | undefined;
  private pings: ReturnType<typeof setInterval> | undefined;
  private closed = false;
  private pingTimes = new Set<number>();
  constructor(
    private host: boolean,
    private link: DataLink,
    private snap: () => Promise<Blob>,
    private isReady: () => boolean,
    private progress: (p: CaptureProgress) => void,
    private result: (b: Blob) => void,
    private error: (s: string) => void,
    private synced: () => void,
  ) {
    link.acceptFile = (m) =>
      !!this.session &&
      this.gate.matches(m.captureId) &&
      (host
        ? m.kind === 'pose' && !this.session.remote.has(m.pose)
        : m.kind === 'result' && this.session.committed);
    link.onFile = (m, b) => {
      void this.file(m, b).catch((e) =>
        this.cancel(e instanceof Error ? e.message : 'Could not finish the strip.'),
      );
    };
    link.onError = (s) => this.cancel(s);
    link.onProgress = (f) => {
      if (this.session) this.update('Sharing your photos', 3, null, Math.round(f * 100));
    };
    if (host) {
      const ping = () => {
        if (!this.closed && link.open) {
          const t0 = performance.now();
          this.pingTimes.add(t0);
          if (this.pingTimes.size > 10)
            this.pingTimes.delete(this.pingTimes.values().next().value!);
          link.send({ type: 'ping', t0 });
        }
      };
      ping();
      this.pings = setInterval(ping, 700);
    }
  }
  get busy() {
    return this.session !== null;
  }
  private later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }
  private update(phase: string, pose = 0, count: number | null = null, percent = 0) {
    this.progress({ busy: true, phase, pose, count, percent });
  }
  start(settings: StripSettings) {
    if (!this.host || !this.isReady() || !this.clock.ready || this.busy)
      throw new Error('Both partners must be ready and connected.');
    const id = crypto.randomUUID(),
      target = performance.now() + 4500;
    this.begin(id, target, settings);
    this.link.send({ type: 'prepare', id, target: target + this.clock.offset, settings });
    this.update('Synchronizing your countdown');
    this.later(() => {
      if (this.session && !this.session.committed)
        this.cancel('The countdown could not be confirmed. Please ready up and try again.');
    }, 2500);
  }
  private begin(id: string, target: number, settings: StripSettings) {
    this.gate.begin(id);
    this.session = {
      id,
      target,
      settings,
      own: new Map(),
      remote: new Map(),
      committed: false,
      composing: false,
    };
    this.later(
      () => this.cancel('The photo transfer timed out. Check your connection and retake.'),
      60_000,
    );
  }
  handle(m: PeerMessage) {
    if (m.type === 'ping' && !this.host) {
      this.link.send({ type: 'pong', t0: m.t0, t1: performance.now() });
      return;
    }
    if (m.type === 'pong' && this.host && this.pingTimes.delete(m.t0)) {
      this.clock.add(m.t0, m.t1, performance.now());
      this.synced();
      return;
    }
    if (m.type === 'prepare' && !this.host) {
      if (this.busy || !this.isReady() || !validTarget(m.target, performance.now())) {
        this.link.send({
          type: 'cancel',
          id: m.id,
          reason: 'Both cameras need to be ready. Please try again.',
        });
        return;
      }
      this.begin(m.id, m.target, m.settings);
      this.update('Synchronizing your countdown');
      this.link.send({ type: 'accept', id: m.id });
      return;
    }
    const s = this.session;
    if (!s || !('id' in m) || m.id !== s.id) return;
    if (m.type === 'cancel') {
      this.cancel(m.reason, false);
      return;
    }
    if (m.type === 'accept' && this.host && !s.committed) {
      if (s.target - performance.now() < 1000) {
        this.cancel('The countdown arrived too late. Please try again.');
        return;
      }
      this.link.send({ type: 'commit', id: s.id });
      this.schedule(s);
    }
    if (m.type === 'commit' && !this.host && !s.committed) {
      if (s.target - performance.now() < 500) {
        this.cancel('The countdown arrived too late. Please try again.');
        return;
      }
      this.schedule(s);
    }
    if (m.type === 'received' && this.host && s.final) {
      const blob = s.final;
      this.finish();
      this.result(blob);
    }
  }
  private schedule(s: Session) {
    s.committed = true;
    const targets = captureTargets(s.target);
    const tick = () => {
      const now = performance.now(),
        index = targets.findIndex((t) => t > now);
      if (index !== -1)
        this.update(
          'A little closer. Hold that pose.',
          index + 1,
          Math.max(1, Math.ceil((targets[index] - now) / 1000)),
        );
    };
    tick();
    this.ticker = setInterval(tick, 100);
    targets.forEach((target, i) =>
      this.later(
        () => {
          void this.take(s, i, target);
        },
        Math.max(0, target - performance.now()),
      ),
    );
  }
  private async take(s: Session, pose: number, target: number) {
    try {
      if (this.session !== s) return;
      if (performance.now() - target > 750 || !this.isReady())
        throw new Error(
          'A camera paused during the countdown. Keep both booth tabs open and retake.',
        );
      const blob = await this.snap();
      if (this.session !== s) return;
      if (blob.size > MAX_POSE_BYTES) throw new Error('A local photo exceeded the size limit.');
      s.own.set(pose, blob);
      if (pose === 2) {
        clearInterval(this.ticker);
        this.update('Collecting your three poses', 3);
      }
      if (!this.host) await this.link.sendFile(blob, { captureId: s.id, kind: 'pose', pose });
      else await this.complete(s);
    } catch (e) {
      if (this.session === s)
        this.cancel(e instanceof Error ? e.message : 'Your photo could not be captured.');
    }
  }
  private async file(m: FileMeta, blob: Blob) {
    const s = this.session;
    if (!s || s.id !== m.captureId) return;
    if (this.host && m.kind === 'pose') {
      s.remote.set(m.pose, blob);
      await this.complete(s);
    } else if (!this.host && m.kind === 'result') {
      this.link.send({ type: 'received', id: s.id });
      this.finish();
      this.result(blob);
    }
  }
  private async complete(s: Session) {
    if (s.own.size !== 3 || s.remote.size !== 3 || s.composing) return;
    s.composing = true;
    this.update('Making your shared memory', 3);
    const ordered = (m: Map<number, Blob>) => [m.get(0)!, m.get(1)!, m.get(2)!];
    const blob = await compose(ordered(s.own), ordered(s.remote), s.settings);
    if (this.session !== s) return;
    s.final = blob;
    this.update('Sending the same strip to your person', 3);
    await this.link.sendFile(blob, { captureId: s.id, kind: 'result', pose: 0 });
    if (this.session === s) this.update('Waiting for your person to receive the strip', 3);
  }
  cancel(reason = 'Capture cancelled. Ready up when you’re both set.', notify = true) {
    const id = this.session?.id;
    if (!id) return;
    if (notify && this.link.open)
      this.link.send({ type: 'cancel', id, reason: reason.slice(0, 160) });
    this.link.clearTransfers();
    this.finish();
    if (!this.closed) this.error(reason);
  }
  private finish() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    clearInterval(this.ticker);
    this.session = null;
    this.gate.end();
    this.progress({ busy: false, phase: '', pose: 0, count: null, percent: 0 });
  }
  close() {
    this.closed = true;
    this.cancel('Partner disconnected.');
    this.finish();
    clearInterval(this.pings);
    this.pingTimes.clear();
  }
}
