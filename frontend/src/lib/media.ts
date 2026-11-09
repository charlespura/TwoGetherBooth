export function mediaError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError')
    return 'Camera access was denied. Allow it in your browser’s site settings, then try again.';
  if (name === 'NotFoundError')
    return 'No camera was found. Connect a camera, or open this booth on your phone.';
  if (name === 'NotReadableError' || name === 'AbortError')
    return 'Your camera may be in use by another app. Close that app and try again.';
  if (name === 'OverconstrainedError')
    return 'That camera is unavailable. Please select another camera.';
  return error instanceof Error ? error.message : 'Could not open your camera. Please try again.';
}

export class Camera {
  stream: MediaStream | null = null;
  private generation = 0;
  constructor(private changed: (stream: MediaStream | null) => void) {}
  async open(deviceId?: string) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      throw new Error('Camera access needs HTTPS. On this computer, localhost also works.');
    const generation = ++this.generation;
    // Some mobile cameras cannot open a second lens until the first is released.
    if (deviceId) this.stream?.getVideoTracks().forEach((t) => t.stop());
    const fresh = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 960 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
      },
      audio: false,
    });
    if (generation !== this.generation) {
      fresh.getTracks().forEach((t) => t.stop());
      throw new Error('Camera request cancelled.');
    }
    const audio = this.stream?.getAudioTracks() ?? [];
    this.stream?.getVideoTracks().forEach((t) => t.stop());
    this.stream = new MediaStream([...fresh.getVideoTracks(), ...audio]);
    this.changed(this.stream);
  }
  async microphone() {
    const track = this.stream?.getAudioTracks()[0];
    if (track?.readyState === 'live') {
      track.enabled = !track.enabled;
      this.changed(new MediaStream(this.stream!.getTracks()));
      return track.enabled;
    }
    const generation = this.generation;
    const fresh = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    if (generation !== this.generation || !this.stream) {
      fresh.getTracks().forEach((t) => t.stop());
      return false;
    }
    this.stream = new MediaStream([...this.stream.getVideoTracks(), ...fresh.getAudioTracks()]);
    this.changed(this.stream);
    return true;
  }
  toggleVideo() {
    const track = this.stream?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      this.changed(new MediaStream(this.stream!.getTracks()));
      return track.enabled;
    }
    return false;
  }
  stop() {
    this.generation++;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.changed(null);
  }
}
