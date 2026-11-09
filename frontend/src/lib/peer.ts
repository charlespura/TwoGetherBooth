import type { IceServer, PeerMessage, Relay } from '@twogether/protocol';
import { DataLink } from './transfer';
export class Peer {
  readonly pc: RTCPeerConnection;
  link: DataLink | null = null;
  private timeout: ReturnType<typeof setTimeout>;
  private disconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private candidates: RTCIceCandidateInit[] = [];
  private closed = false;
  private remote = new MediaStream();
  private localStream: MediaStream;
  constructor(
    host: boolean,
    iceServers: IceServer[],
    stream: MediaStream,
    private relay: (r: Relay) => void,
    private remoteChanged: (s: MediaStream) => void,
    private state: (s: string) => void,
    private channel: (link: DataLink) => void,
    private error: (s: string) => void,
  ) {
    this.pc = new RTCPeerConnection({ iceServers });
    this.localStream = stream;
    // Only the offerer creates m-lines. The answerer attaches its tracks to the
    // offered transceivers after setRemoteDescription, avoiding duplicate m-lines.
    if (host)
      for (const kind of ['video', 'audio'] as const) {
        const track = stream.getTracks().find((t) => t.kind === kind);
        this.pc.addTransceiver(track ?? kind, { direction: 'sendrecv', streams: [stream] });
      }
    this.pc.onicecandidate = (e) => {
      if (e.candidate)
        this.relay({
          kind: 'candidate',
          candidate: { ...e.candidate.toJSON(), candidate: e.candidate.candidate },
        });
    };
    this.pc.ontrack = (e) => {
      this.remote.addTrack(e.track);
      this.remoteChanged(new MediaStream(this.remote.getTracks()));
    };
    this.pc.onconnectionstatechange = () => {
      if (this.closed) return;
      const s = this.pc.connectionState;
      if (s === 'connected') {
        clearTimeout(this.timeout);
        clearTimeout(this.disconnectTimer);
        this.state(this.link?.open ? 'connected' : 'connecting');
      }
      if (s === 'disconnected') {
        this.state('reconnecting');
        this.disconnectTimer = setTimeout(() => this.fail(), 10_000);
      }
      if (s === 'failed') this.fail();
    };
    this.timeout = setTimeout(() => this.fail(), 25_000);
    this.pc.ondatachannel = (e) => this.bind(e.channel);
    if (host) {
      this.bind(this.pc.createDataChannel('booth', { ordered: true }));
      void this.offer();
    }
  }
  private fail() {
    if (!this.closed)
      this.error(
        'Your cameras could not connect. Retry the connection. Across different networks, the service may need a TURN relay.',
      );
  }
  private bind(channel: RTCDataChannel) {
    if (this.closed) {
      channel.close();
      return;
    }
    this.link = new DataLink(channel);
    channel.onopen = () => {
      if (!this.closed) {
        clearTimeout(this.timeout);
        this.state('connected');
        this.channel(this.link!);
      }
    };
    channel.addEventListener('close', () => {
      if (!this.closed) {
        this.state('reconnecting');
        this.error('The private photo connection closed. Reconnect before taking another strip.');
      }
    });
  }
  private async offer() {
    try {
      const offer = await this.pc.createOffer();
      if (this.closed) return;
      await this.pc.setLocalDescription(offer);
      this.relay({
        kind: 'description',
        description: { type: 'offer', sdp: this.pc.localDescription!.sdp },
      });
    } catch {
      if (!this.closed) this.fail();
    }
  }
  async signal(payload: Relay) {
    if (this.closed) return;
    try {
      if (payload.kind === 'candidate') {
        if (this.pc.remoteDescription) await this.pc.addIceCandidate(payload.candidate);
        else this.candidates.push(payload.candidate);
      } else {
        await this.pc.setRemoteDescription(payload.description);
        for (const c of this.candidates) await this.pc.addIceCandidate(c);
        this.candidates = [];
        if (payload.description.type === 'offer') {
          for (const tx of this.pc.getTransceivers()) {
            tx.direction = 'sendrecv';
            tx.sender.setStreams(this.localStream);
            await tx.sender.replaceTrack(
              this.localStream.getTracks().find((t) => t.kind === tx.receiver.track.kind) ?? null,
            );
          }
          await this.pc.setLocalDescription(await this.pc.createAnswer());
          this.relay({
            kind: 'description',
            description: { type: 'answer', sdp: this.pc.localDescription!.sdp },
          });
        }
      }
    } catch {
      if (!this.closed) this.fail();
    }
  }
  async replace(stream: MediaStream) {
    this.localStream = stream;
    for (const tx of this.pc.getTransceivers()) {
      const kind = tx.receiver.track.kind;
      await tx.sender.replaceTrack(stream.getTracks().find((t) => t.kind === kind) ?? null);
    }
  }
  send(m: PeerMessage) {
    this.link?.send(m);
  }
  close() {
    this.closed = true;
    clearTimeout(this.timeout);
    clearTimeout(this.disconnectTimer);
    this.link?.close();
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pc.ondatachannel = null;
    this.pc.close();
    this.remote.getTracks().forEach((t) => t.stop());
    this.candidates = [];
  }
}
