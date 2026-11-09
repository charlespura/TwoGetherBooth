import { POSE_GAP } from '@twogether/protocol';
export class ClockSync {
  private best = Infinity;
  offset = 0;
  samples = 0;
  add(t0: number, t1: number, t2: number) {
    const rtt = t2 - t0;
    if (rtt < 0 || rtt > 2000) return;
    this.samples++;
    if (rtt < this.best) {
      this.best = rtt;
      this.offset = t1 - (t0 + t2) / 2;
    }
  }
  get ready() {
    return this.samples >= 3;
  }
  get uncertainty() {
    return this.best / 2;
  }
}
export function captureTargets(start: number) {
  return [start, start + POSE_GAP, start + 2 * POSE_GAP];
}
export function canCapture(
  host: boolean,
  localReady: boolean,
  remoteReady: boolean,
  busy: boolean,
  synced: boolean,
) {
  return host && localReady && remoteReady && !busy && synced;
}
export function validTarget(target: number, now: number) {
  return Number.isFinite(target) && target - now >= 1000 && target - now <= 15_000;
}
export class CaptureGate {
  id: string | null = null;
  begin(id: string) {
    if (this.id) throw new Error('A capture is already in progress.');
    this.id = id;
  }
  matches(id: string) {
    return this.id === id;
  }
  end() {
    this.id = null;
  }
}
