// Run with the local app and signaling services running: npm run demo:record
// Illustrated cameras exist only in these isolated recording browser contexts.
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const work = path.join(root, '.demo-work');
const output = path.join(root, 'frontend/public/demo');
await mkdir(work, { recursive: true });
await mkdir(output, { recursive: true });
const launchOptions = {
  channel: 'chrome',
  headless: true,
  args: [
    '--disable-features=WebRtcHideLocalIpsWithMdns',
    '--autoplay-policy=no-user-gesture-required',
  ],
};
const browser = await chromium.launch(launchOptions);
const guestBrowser = await chromium.launch(launchOptions);
const frames = [];
let activePage,
  scene,
  recording = false,
  loop;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function illustratedCamera({ person }) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  let pose = 0;
  // The recording driver changes poses while the real capture countdown runs.
  window.demoPose = (value) => {
    pose = value;
  };
  function draw() {
    const sam = person === 'Sam';
    const t = performance.now() / 1000;
    ctx.fillStyle = sam ? '#dce5df' : '#efddd5';
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = sam ? '#bacdc1' : '#dcc2b4';
    ctx.beginPath();
    ctx.arc(90, 85, 160, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff40';
    ctx.fillRect(490, 35, 100, 180);
    ctx.fillStyle = sam ? '#668d77' : '#ae7486';
    ctx.beginPath();
    ctx.ellipse(320, 493, 180, 155, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(320, 225 + Math.sin(t * 1.6) * 3);
    ctx.rotate(Math.sin(t) * 0.025);
    ctx.fillStyle = sam ? '#3f3430' : '#654334';
    ctx.beginPath();
    ctx.ellipse(0, -8, 104, 130, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = sam ? '#c99572' : '#e6b295';
    ctx.fillRect(-27, 85, 54, 59);
    ctx.beginPath();
    ctx.ellipse(0, 0, 84, 105, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = sam ? '#3f3430' : '#654334';
    ctx.beginPath();
    ctx.ellipse(-25, -83, 73, 35, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(57, -69, 36, 49, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#46312e';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (const x of [-30, 30]) {
      ctx.beginPath();
      if (pose === 1 || Math.sin(t * 2) > 0.995) ctx.arc(x, 3, 10, Math.PI, 2 * Math.PI);
      else {
        ctx.moveTo(x, -3);
        ctx.lineTo(x, 6);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = '#9e5b53';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 26, pose === 2 ? 23 : 17, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.fillStyle = '#d58e8255';
    for (const x of [-51, 51]) {
      ctx.beginPath();
      ctx.ellipse(x, 31, 17, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (pose > 0) {
      ctx.save();
      ctx.translate(490, 240 + Math.sin(t * 2) * 7);
      ctx.fillStyle = sam ? '#668d77' : '#ae7486';
      ctx.font = '58px Georgia';
      ctx.fillText(pose === 1 ? '♥' : '✦', 0, 0);
      ctx.restore();
    }
    // Camera is mirrored by the app; mirror this label so it remains readable.
    ctx.save();
    ctx.translate(640, 0);
    ctx.scale(-1, 1);
    ctx.fillStyle = '#ffffffcc';
    ctx.fillRect(186, 423, 268, 30);
    ctx.fillStyle = '#5e5056';
    ctx.font = '13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${person.toUpperCase()} · ILLUSTRATED DEMO CAMERA`, 320, 443);
    ctx.restore();
    requestAnimationFrame(draw);
  }
  draw();
  navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(24);
  navigator.mediaDevices.enumerateDevices = async () => [];
}

async function makePage(person) {
  const owner = person === 'Sam' ? guestBrowser : browser;
  const context = await owner.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(illustratedCamera, { person });
  await context.addInitScript(() => {
    const NativePeer = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends NativePeer {
      constructor(config) {
        super({ ...config, iceServers: [] });
        this.addEventListener('iceconnectionstatechange', () =>
          console.log('Demo ICE:', this.iceConnectionState),
        );
      }
    };
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent =
        '.site-header{height:80px}.booth-page{padding-top:24px}.booth-page .camera-panel{aspect-ratio:16/9}.booth-heading{margin-bottom:20px}.camera-toolbar{padding-block:10px}';
      document.head.append(style);
    });
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.text().startsWith('Demo ICE:')) console.log(person, message.text());
  });
  return page;
}
function chapter(step, title, instruction) {
  scene = { step, title, instruction };
  console.log(title);
}
async function click(page, locator) {
  const box = await locator.boundingBox();
  if (box) {
    await page.evaluate(
      ({ x, y }) => {
        let dot = document.getElementById('demo-pointer');
        if (!dot) {
          dot = document.createElement('div');
          dot.id = 'demo-pointer';
          dot.style.cssText =
            'position:fixed;width:38px;height:38px;border:3px solid #965a6c;border-radius:50%;background:#965a6c20;z-index:9999;pointer-events:none;transition:top .3s,left .3s';
          document.body.append(dot);
        }
        dot.style.left = `${x - 19}px`;
        dot.style.top = `${y - 19}px`;
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    await pause(450);
  }
  await locator.click();
  await pause(400);
  await page.evaluate(() => document.getElementById('demo-pointer')?.remove());
}

try {
  const host = await makePage('Alex'),
    guest = await makePage('Sam');
  activePage = host;
  await host.goto('http://localhost:5173');
  await host.evaluate(() => document.fonts.ready);
  // Avoid recording the watch button opening a recursive demo.
  await host.addStyleTag({ content: '.demo-trigger { visibility: hidden; }' });
  chapter(
    0,
    'Different places. One photo.',
    'A private photobooth for you and your favorite person.',
  );
  recording = true;
  const start = Date.now();
  loop = (async () => {
    while (recording) {
      const frame = {
        ...scene,
        time: Date.now() - start,
        file: path.join(work, `frame-${frames.length}.jpg`),
      };
      await activePage.screenshot({
        path: frame.file,
        type: 'jpeg',
        quality: 86,
        animations: 'allow',
      });
      frames.push(frame);
      await pause(170);
    }
  })();
  await pause(3000);
  chapter(
    1,
    '01 / Open your little booth',
    'Create a booth, add your name, and enable your camera.',
  );
  await click(host, host.getByRole('button', { name: 'Create a Booth' }));
  await host.getByPlaceholder('Your first name').fill('Alex');
  await click(host, host.getByRole('button', { name: 'Enable camera', exact: true }));
  await expect(host.getByRole('button', { name: 'Restart camera' })).toBeVisible();
  await pause(1800);
  await click(host, host.getByRole('button', { name: 'Create my private booth' }));
  const invite = await host.getByRole('textbox', { name: 'Private invitation link' }).inputValue();
  chapter(
    2,
    '02 / Save the other seat',
    'Copy your private invite link and send it to your person.',
  );
  await pause(1500);
  await click(host, host.getByRole('button', { name: 'Copy invite link' }));
  await guest.goto(invite);
  activePage = guest;
  chapter(
    2,
    '02 / Your person opens the invitation',
    'They preview their camera, then ask to join your booth.',
  );
  await guest.getByPlaceholder('Your first name').fill('Sam');
  await click(guest, guest.getByRole('button', { name: 'Enable camera', exact: true }));
  await pause(1500);
  await click(guest, guest.getByRole('button', { name: 'Ask to join the booth' }));
  await expect(host.getByRole('button', { name: 'Let them in' })).toBeVisible();
  activePage = host;
  chapter(2, '02 / A hello, just for two', 'Approve your person to connect your cameras.');
  await pause(1700);
  await click(host, host.getByRole('button', { name: 'Let them in' }));
  await expect(host.getByRole('status').filter({ hasText: 'Together in the booth' })).toBeVisible({
    timeout: 30000,
  });
  await expect
    .poll(() => host.locator('.partner video').evaluate((v) => v.videoWidth))
    .toBeGreaterThan(0);
  chapter(3, '03 / Make it yours', 'Pick a frame and add the little details that make it you.');
  await pause(1800);
  await click(host, host.getByRole('button', { name: /Rose scrapbook/ }));
  await host.getByLabel('Your names').fill('Alex & Sam');
  await host.getByLabel('A little caption').fill('Closer, wherever we are.');
  await host.getByLabel('Your date').fill('2026-11-09');
  await pause(2400);
  chapter(4, '04 / Ready when you both are', 'Both tap Ready. Then the host taps Take our photos.');
  await click(host, host.getByRole('button', { name: 'Ready when you are' }));
  activePage = guest;
  await pause(1000);
  await click(guest, guest.getByRole('button', { name: 'Ready when you are' }));
  activePage = host;
  await expect(host.getByRole('button', { name: 'Take our photos' })).toBeEnabled();
  await pause(1000);
  await click(host, host.getByRole('button', { name: 'Take our photos' }));
  chapter(
    4,
    '04 / Three poses. One little memory.',
    'Follow the countdown together. Smile, get silly, make it yours.',
  );
  await pause(3000);
  await Promise.all([
    host.evaluate(() => window.demoPose(1)),
    guest.evaluate(() => window.demoPose(1)),
  ]);
  await pause(3500);
  await Promise.all([
    host.evaluate(() => window.demoPose(2)),
    guest.evaluate(() => window.demoPose(2)),
  ]);
  await expect(host.getByRole('button', { name: 'Download PNG' })).toBeVisible({ timeout: 40000 });
  await expect(guest.getByRole('button', { name: 'Download PNG' })).toBeVisible();
  chapter(
    5,
    '05 / One for you. One for them.',
    'Both receive the same strip. Download the PNG to keep your memory.',
  );
  await pause(2200);
  const [download] = await Promise.all([
    host.waitForEvent('download'),
    click(host, host.getByRole('button', { name: 'Download PNG' })),
  ]);
  await download.saveAs(path.join(work, 'demo-strip.png'));
  await pause(1800);
  activePage = guest;
  chapter(5, 'Your person gets it too.', 'The same keepsake, on both sides of the distance.');
  await pause(2600);
  activePage = host;
  chapter(
    5,
    'A little closer, wherever you are.',
    'Create your own booth. Invite your person. Make a memory.',
  );
  await pause(3200);
  recording = false;
  await loop;
  await writeFile(path.join(work, 'timeline.json'), JSON.stringify(frames));
  console.log(`Captured ${frames.length} frames. Preparing narration and animation...`);
} finally {
  recording = false;
  if (loop) await loop.catch(() => {});
  await browser.close();
  await guestBrowser.close();
}

execFileSync('powershell.exe', ['-NoProfile', '-File', 'scripts/narrate-demo.ps1'], {
  stdio: 'inherit',
});
execFileSync(process.execPath, ['scripts/render-demo.mjs'], { stdio: 'inherit' });
