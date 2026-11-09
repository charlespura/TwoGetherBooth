import { MAX_POSE_BYTES, type StripSettings } from '@twogether/protocol';
export function toBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Your browser could not render this photo.'))),
      type,
      quality,
    ),
  );
}
export async function snapshot(video: HTMLVideoElement): Promise<Blob> {
  if (
    video.readyState < 2 ||
    !video.videoWidth ||
    !(video.srcObject as MediaStream | null)
      ?.getVideoTracks()
      .some((t) => t.enabled && t.readyState === 'live')
  )
    throw new Error('Turn your camera on before taking a photo.');
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  const scale = Math.max(640 / video.videoWidth, 480 / video.videoHeight),
    w = video.videoWidth * scale,
    h = video.videoHeight * scale;
  // Match the mirrored local preview; only local full-resolution media is used.
  ctx.translate(640, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, (640 - w) / 2, (480 - h) / 2, w, h);
  let blob = await toBlob(canvas, 'image/jpeg', 0.82);
  if (blob.size > MAX_POSE_BYTES) blob = await toBlob(canvas, 'image/jpeg', 0.58);
  if (blob.size > MAX_POSE_BYTES) throw new Error('This photo is too large. Please try again.');
  return blob;
}
async function image(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, max: number) {
  let output = value;
  while (ctx.measureText(output).width > max && output.length > 1)
    output = output.slice(0, -2) + '…';
  ctx.fillText(output, x, y);
}
export async function compose(host: Blob[], guest: Blob[], s: StripSettings): Promise<Blob> {
  if (host.length !== 3 || guest.length !== 3) throw new Error('All six photos are needed.');
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 1420;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  const rose = s.frame === 'rose',
    mono = s.frame === 'mono';
  ctx.fillStyle = rose ? '#eed9db' : mono ? '#f7f7f3' : '#fbf4e5';
  ctx.fillRect(0, 0, 1000, 1420);
  ctx.fillStyle = mono ? '#262329' : '#67444e';
  ctx.textAlign = 'center';
  ctx.font = 'italic 42px Georgia';
  text(ctx, s.names || 'Two places. One little memory.', 500, 80, 880);
  const images = await Promise.all([...host, ...guest].map(image));
  for (let i = 0; i < 3; i++) {
    const y = 120 + i * 354;
    ctx.save();
    ctx.filter = mono ? 'grayscale(1)' : 'none';
    ctx.drawImage(images[i], 44, y, 450, 337.5);
    ctx.drawImage(images[i + 3], 506, y, 450, 337.5);
    ctx.restore();
    if (rose) {
      ctx.fillStyle = 'rgba(255,250,231,.75)';
      ctx.save();
      ctx.translate(52, y + 4);
      ctx.rotate(-0.12);
      ctx.fillRect(-20, -12, 100, 26);
      ctx.restore();
    }
  }
  ctx.fillStyle = mono ? '#262329' : '#67444e';
  ctx.font = '30px Georgia';
  text(ctx, s.caption || 'Closer, for a moment.', 500, 1260, 880);
  ctx.font = '19px sans-serif';
  ctx.fillText(s.date || '', 500, 1300);
  ctx.font = '17px sans-serif';
  ctx.fillText('T W O G E T H E R  B O O T H', 500, 1370);
  const blob = await toBlob(canvas);
  if (blob.size > 3_500_000)
    throw new Error('The composed strip exceeded the transfer limit. Please retake.');
  return blob;
}
