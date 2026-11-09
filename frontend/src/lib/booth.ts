import type { Membership, PeerMessage, StripSettings, ServerSignal } from '@twogether/protocol';
import { Camera, mediaError } from './media';
import { Signaling } from './signaling';
import { Peer } from './peer';
import { Capture, type CaptureProgress } from './capture';
import { snapshot } from './render';
export type BoothState = {
  stage: 'landing' | 'setup' | 'session' | 'result';
  intent: 'create' | 'join';
  token: string;
  name: string;
  stream: MediaStream | null;
  remote: MediaStream | null;
  camera: boolean;
  mic: boolean;
  mediaBusy: boolean;
  devices: MediaDeviceInfo[];
  member: Membership | null;
  partnerName: string;
  status: string;
  error: string;
  notice: string;
  pending: { requestId: string; name: string } | null;
  ready: boolean;
  partnerReady: boolean;
  partnerCamera: boolean;
  partnerMic: boolean;
  settings: StripSettings;
  clockReady: boolean;
  uncertainty: number;
  progress: CaptureProgress;
  result: Blob | null;
};
const emptyProgress: CaptureProgress = { busy: false, phase: '', pose: 0, count: null, percent: 0 };
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export class Booth {
  private listeners = new Set<() => void>();
  private signal: Signaling | null = null;
  private peer: Peer | null = null;
  private capture: Capture | null = null;
  video: HTMLVideoElement | null = null;
  readonly media: Camera;
  private deviceChanged = () => {
    void this.devices();
  };
  private mounted = false;
  state: BoothState;
  constructor() {
    const token = new URLSearchParams(location.hash.slice(1)).get('room') ?? '';
    const invited = /^[A-Za-z0-9_-]{32,64}$/.test(token);
    this.state = {
      stage: invited ? 'setup' : 'landing',
      intent: invited ? 'join' : 'create',
      token: invited ? token : '',
      name: '',
      stream: null,
      remote: null,
      camera: false,
      mic: false,
      mediaBusy: false,
      devices: [],
      member: null,
      partnerName: 'Your person',
      status: 'idle',
      error: '',
      notice: '',
      pending: null,
      ready: false,
      partnerReady: false,
      partnerCamera: true,
      partnerMic: false,
      settings: { frame: 'cream', names: '', caption: '', date: localDate() },
      clockReady: false,
      uncertainty: 0,
      progress: emptyProgress,
      result: null,
    };
    this.media = new Camera((stream) => {
      const camera = !!stream?.getVideoTracks().some((t) => t.enabled && t.readyState === 'live'),
        mic = !!stream?.getAudioTracks().some((t) => t.enabled);
      this.update({ stream, camera, mic });
      if (stream) {
        for (const t of stream.getTracks())
          t.onended = () => {
            this.unready();
            this.update({
              camera: !!this.media.stream
                ?.getVideoTracks()
                .some((t) => t.enabled && t.readyState === 'live'),
              error: 'A camera or microphone stopped. Reopen your camera or reconnect.',
            });
          };
        void this.peer
          ?.replace(stream)
          .catch(() =>
            this.update({ error: 'Could not switch your camera. Reconnect the booth.' }),
          );
      }
      this.sendState();
    });
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  snapshot = () => this.state;
  update(p: Partial<BoothState>) {
    this.state = { ...this.state, ...p };
    for (const fn of this.listeners) fn();
  }
  mount() {
    if (this.mounted) return;
    this.mounted = true;
    navigator.mediaDevices?.addEventListener('devicechange', this.deviceChanged);
    window.addEventListener('pagehide', this.onPageHide);
  }
  private onPageHide = () => this.leave();
  dispose() {
    this.mounted = false;
    navigator.mediaDevices?.removeEventListener('devicechange', this.deviceChanged);
    window.removeEventListener('pagehide', this.onPageHide);
    this.shutdown();
  }
  setup(intent: 'create' | 'join', token = '') {
    this.update({ stage: 'setup', intent, token, error: '', notice: '' });
  }
  async devices() {
    try {
      this.update({
        devices: (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === 'videoinput',
        ),
      });
    } catch {
      /* Camera selection is optional. */
    }
  }
  async openCamera(deviceId?: string) {
    if (this.state.mediaBusy) return;
    this.unready();
    this.update({ mediaBusy: true, error: '' });
    try {
      await this.media.open(deviceId);
      await this.devices();
    } catch (e) {
      this.update({
        error: mediaError(e),
        camera: !!this.media.stream
          ?.getVideoTracks()
          .some((t) => t.readyState === 'live' && t.enabled),
      });
    } finally {
      this.update({ mediaBusy: false });
    }
  }
  async microphone() {
    if (this.state.mediaBusy) return;
    this.update({ mediaBusy: true, error: '' });
    try {
      await this.media.microphone();
    } catch (e) {
      this.update({ error: `Microphone: ${mediaError(e)}` });
    } finally {
      this.update({ mediaBusy: false });
    }
  }
  toggleCamera() {
    if (this.state.progress.busy) return;
    if (!this.state.stream?.getVideoTracks().some((t) => t.readyState === 'live')) {
      void this.openCamera();
      return;
    }
    this.unready();
    this.media.toggleVideo();
  }
  enter() {
    if (!this.state.camera) return;
    const { intent, token, name } = this.state;
    if (intent === 'join' && !/^[A-Za-z0-9_-]{32,64}$/.test(token)) {
      this.update({ error: 'Paste a valid TwoGether invitation link.' });
      return;
    }
    this.signal?.close();
    this.update({ error: '', notice: '', status: 'connecting' });
    this.signal = new Signaling(
      intent === 'create' ? { type: 'create', name } : { type: 'join', room: token, name },
      (m) => this.event(m),
      (s) => {
        this.update({ status: s });
        if (s === 'reconnecting') {
          this.resetPeer();
          this.update({
            notice:
              'Reconnecting to the booth server. We retry for up to 30 seconds. Keep this page open.',
          });
        }
      },
    );
    this.signal.connect();
  }
  private event(m: ServerSignal) {
    if (m.type === 'joined') {
      this.update({ member: m, stage: 'session', status: 'waiting', notice: '', pending: null });
      return;
    }
    if (m.type === 'waiting') {
      this.update({ status: 'approval', notice: 'Your person has been asked to let you in.' });
      return;
    }
    if (m.type === 'join-request') {
      this.update({ pending: m });
      return;
    }
    if (m.type === 'request-gone') {
      if (this.state.pending?.requestId === m.requestId) this.update({ pending: null });
      return;
    }
    if (m.type === 'peer-ready') {
      this.resetPeer();
      this.update({
        status: 'connecting',
        partnerName: m.name || 'Your person',
        notice: '',
        error: '',
      });
      if (!this.state.stream) return;
      this.peer = new Peer(
        this.state.member?.role === 'host',
        m.iceServers,
        this.state.stream,
        (r) => this.signal?.send({ type: 'signal', payload: r }),
        (remote) => this.update({ remote }),
        (status) => this.update({ status }),
        (link) => {
          this.capture = new Capture(
            this.state.member?.role === 'host',
            link,
            () => {
              if (!this.video) throw new Error('Your camera preview is unavailable.');
              return snapshot(this.video);
            },
            () =>
              this.state.ready &&
              this.state.partnerReady &&
              this.state.camera &&
              this.state.partnerCamera,
            (progress) => this.update({ progress }),
            (result) => {
              this.unready();
              this.update({ result, stage: 'result', error: '' });
            },
            (error) => {
              this.unready();
              this.update({ error });
            },
            () =>
              this.update({
                clockReady: !!this.capture?.clock.ready,
                uncertainty: this.capture?.clock.uncertainty ?? 0,
              }),
          );
          link.onMessage = (msg) => this.message(msg);
          this.sendState();
          if (this.state.member?.role === 'host')
            link.send({ type: 'settings', settings: this.state.settings });
        },
        (error) => {
          this.capture?.cancel('The connection was interrupted.');
          this.update({ error, ready: false, partnerReady: false, status: 'error' });
        },
      );
      return;
    }
    if (m.type === 'signal') {
      void this.peer?.signal(m.payload);
      return;
    }
    if (m.type === 'peer-offline' || m.type === 'peer-left') {
      this.resetPeer();
      this.update({
        status: m.type === 'peer-left' ? 'left' : 'reconnecting',
        notice:
          m.type === 'peer-left'
            ? 'Your person left the booth. You can invite them again.'
            : 'Your person lost their connection. Their place is held for 30 seconds.',
      });
      return;
    }
    if (m.type === 'room-expired') {
      this.resetPeer();
      this.signal?.close();
      this.media.stop();
      this.update({
        status: 'expired',
        member: null,
        error: 'This booth has ended or expired. Open a new booth to meet again.',
      });
      return;
    }
    if (m.type === 'error') {
      this.update({
        status: m.code === 'expired' ? 'expired' : m.code === 'full' ? 'full' : 'error',
        error: m.message,
      });
      if (['expired', 'resume-failed'].includes(m.code)) {
        this.resetPeer();
        this.update({ member: null });
      }
    }
  }
  private message(m: PeerMessage) {
    if (m.type === 'state') {
      this.update({ partnerReady: m.ready, partnerCamera: m.camera, partnerMic: m.mic });
      if ((!m.ready || !m.camera) && this.capture?.busy)
        this.capture.cancel('Your person is no longer ready.');
    }
    if (m.type === 'settings' && this.state.member?.role === 'guest' && !this.capture?.busy)
      this.update({ settings: m.settings });
    if (m.type === 'discard') {
      this.capture?.cancel('The photos were discarded.');
      this.unready();
      this.update({
        result: null,
        stage: 'session',
        notice: 'The current photos have been discarded. You can make another memory.',
      });
    }
    this.capture?.handle(m);
  }
  private sendState() {
    if (this.peer?.link?.open)
      this.peer.send({
        type: 'state',
        ready: this.state.ready,
        camera: this.state.camera,
        mic: this.state.mic,
      });
  }
  private unready() {
    this.update({ ready: false });
    this.sendState();
  }
  ready() {
    if (this.state.status !== 'connected' || !this.state.camera || this.state.progress.busy) return;
    this.update({ ready: !this.state.ready, error: '' });
    this.sendState();
  }
  settings(settings: StripSettings) {
    if (this.state.member?.role !== 'host' || this.state.progress.busy) return;
    this.update({ settings });
    if (this.peer?.link?.open) this.peer.send({ type: 'settings', settings });
  }
  captureNow() {
    try {
      this.update({ error: '' });
      this.capture?.start(this.state.settings);
    } catch (e) {
      this.update({ error: e instanceof Error ? e.message : 'Could not start capture.' });
    }
  }
  cancel() {
    this.capture?.cancel();
    this.unready();
  }
  approve(allow: boolean) {
    const pending = this.state.pending;
    if (pending) {
      this.signal?.send({ type: 'approve', requestId: pending.requestId, allow });
      this.update({ pending: null });
    }
  }
  get invitation() {
    return this.state.member
      ? `${location.origin}${location.pathname}#room=${this.state.member.room}`
      : '';
  }
  async copy() {
    try {
      await navigator.clipboard.writeText(this.invitation);
      this.update({ notice: 'Invitation copied. Send it privately to your person.' });
    } catch {
      this.update({
        notice: 'Copy is unavailable in this browser. Select and copy the invitation link below.',
      });
    }
  }
  async shareInvite() {
    try {
      await navigator.share({
        title: 'Meet me in TwoGether Booth',
        text: 'A little moment, just us.',
        url: this.invitation,
      });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) void this.copy();
    }
  }
  discard() {
    if (this.peer?.link?.open) this.peer.send({ type: 'discard' });
    this.capture?.cancel('Photos discarded.');
    this.unready();
    this.update({
      result: null,
      stage: 'session',
      notice: 'Photos discarded from this booth. Downloads already on a device remain there.',
    });
  }
  retry() {
    this.resetPeer();
    this.update({ error: '', notice: '' });
    if (this.state.member) this.signal?.retry();
    else this.enter();
  }
  private resetPeer() {
    this.capture?.close();
    this.capture = null;
    this.peer?.close();
    this.peer = null;
    this.update({
      remote: null,
      ready: false,
      partnerReady: false,
      clockReady: false,
      progress: emptyProgress,
    });
  }
  private shutdown() {
    this.resetPeer();
    this.signal?.close();
    this.signal = null;
    this.media.stop();
  }
  leave() {
    this.shutdown();
    history.replaceState(null, '', location.pathname);
    this.update({
      stage: 'landing',
      member: null,
      result: null,
      status: 'idle',
      mic: false,
      error: '',
      notice: '',
      pending: null,
    });
  }
}
