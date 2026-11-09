// Render the recorded booth frames with embedded narration and chapter animation.
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const work = path.join(root, '.demo-work');
const output = path.join(root, 'frontend/public/demo');
const frames = JSON.parse(await readFile(path.join(work, 'timeline.json'), 'utf8'));
const storyboard = JSON.parse(
  await readFile(path.join(root, 'scripts/demo-storyboard.json'), 'utf8'),
);
const groups = [];
for (let i = 0; i < frames.length; i++) {
  if (!i || frames[i].title !== frames[i - 1].title) groups.push({ first: i, ...frames[i] });
}
const voices = await Promise.all(
  storyboard.map(async (_, i) =>
    (await readFile(path.join(work, `narration/voice-${i}.wav`))).toString('base64'),
  ),
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  await page.exposeFunction('demoFrame', async (index) =>
    (await readFile(frames[index].file)).toString('base64'),
  );
  const result = await page.evaluate(
    async ({ frames, groups, storyboard, voices, strip }) => {
      const audio = new AudioContext({ sampleRate: 48000 });
      await audio.resume();
      const destination = audio.createMediaStreamDestination();
      const buffers = await Promise.all(
        voices.map(async (base64) => {
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          return audio.decodeAudioData(bytes.buffer);
        }),
      );
      let position = 0,
        sourceGroup = 0;
      const scenes = storyboard.map((item, index) => {
        const group = groups[sourceGroup];
        const end = groups[sourceGroup + 1]?.time ?? frames.at(-1).time + 300;
        const duration = Math.max(
          item.processing ? 4.8 : (end - group.time) / 1000,
          buffers[index].duration + 0.7,
        );
        const scene = {
          ...item,
          title: item.processing ? 'A memory, coming together.' : group.title,
          instruction: item.processing
            ? 'Three poses. Two people. One shared keepsake.'
            : group.instruction,
          step: item.processing ? 5 : group.step,
          start: position,
          duration,
          from: group.time,
          to: end,
          first: group.first,
          last: (groups[sourceGroup + 1]?.first ?? frames.length) - 1,
        };
        position += duration;
        if (!item.processing) sourceGroup++;
        return scene;
      });
      const total = position;
      const canvas = document.createElement('canvas');
      canvas.width = 1440;
      canvas.height = 1080;
      document.body.append(canvas);
      const ctx = canvas.getContext('2d');
      const stripImage = new Image();
      stripImage.src = `data:image/png;base64,${strip}`;
      await stripImage.decode();
      const cache = new Map();
      async function load(index) {
        if (!cache.has(index))
          cache.set(
            index,
            (async () => {
              const image = new Image();
              image.src = `data:image/jpeg;base64,${await window.demoFrame(index)}`;
              await image.decode();
              return image;
            })(),
          );
        return cache.get(index);
      }
      await Promise.all([load(0), load(1), load(2)]);
      function rounded(x, y, w, h, radius, fill) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, radius);
        ctx.fillStyle = fill;
        ctx.fill();
      }
      const ease = (x) => 1 - (1 - x) ** 3;
      function draw(image, scene, elapsed, time, previousImage) {
        const progress = Math.min(1, elapsed / scene.duration);
        const gradient = ctx.createLinearGradient(0, 0, 1440, 1080);
        gradient.addColorStop(0, '#f8f4ed');
        gradient.addColorStop(1, '#e6d5d9');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1440, 1080);
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#bc869a';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(1350, 60, 150 + i * 60 + Math.sin(time / 3) * 8, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = '#965a6c';
        ctx.font = 'bold 15px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('TWOGETHER BOOTH  /  HOW IT WORKS', 48, 43);
        ctx.textAlign = 'right';
        ctx.font = '13px Arial';
        ctx.fillText('NARRATED WALKTHROUGH · ILLUSTRATED CAMERAS', 1392, 43);
        ctx.textAlign = 'left';
        // Chapter copy slides in gently, above the native player's controls.
        const entrance = ease(Math.min(1, elapsed / 0.5));
        ctx.save();
        ctx.globalAlpha = entrance;
        ctx.translate(0, (1 - entrance) * 12);
        ctx.fillStyle = '#3e303c';
        ctx.font = '44px Georgia';
        ctx.fillText(scene.title, 48, 106);
        ctx.fillStyle = '#71636c';
        ctx.font = '23px Arial';
        ctx.fillText(scene.instruction, 48, 148);
        ctx.restore();

        ctx.save();
        ctx.shadowColor = '#3e303c28';
        ctx.shadowBlur = 28;
        ctx.shadowOffsetY = 12;
        rounded(40, 181, 1220, 802, 15, '#f8f5ef');
        ctx.restore();
        rounded(40, 181, 1220, 40, [15, 15, 0, 0], '#eee7df');
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = ['#c8888c', '#d7b56d', '#94aa96'][i];
          ctx.beginPath();
          ctx.arc(63 + i * 20, 201, 5, 0, Math.PI * 2);
          ctx.fill();
        }
        rounded(442, 189, 390, 24, 12, '#ffffff90');
        ctx.fillStyle = '#87717b';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('TwoGether Booth · Product demo', 637, 205);
        ctx.textAlign = 'left';
        ctx.save();
        ctx.beginPath();
        ctx.rect(40, 221, 1220, 762);
        ctx.clip();
        const zoom = 1 + 0.018 * ease(progress);
        ctx.translate(650, 602);
        ctx.scale(zoom, zoom);
        ctx.drawImage(image, -610, -381, 1220, 762);
        if (previousImage && elapsed < 0.4) {
          ctx.globalAlpha = 1 - elapsed / 0.4;
          ctx.drawImage(previousImage, -610, -381, 1220, 762);
        }
        ctx.restore();

        if (scene.processing) {
          rounded(40, 221, 1220, 762, 0, '#3e303cf0');
          const reveal = ease(Math.min(1, progress * 1.2));
          ctx.save();
          ctx.translate(435, 572);
          ctx.rotate(-0.035 + Math.sin(time * 1.5) * 0.008);
          ctx.shadowColor = '#00000045';
          ctx.shadowBlur = 24;
          rounded(-132, -190, 264, 380, 8, '#f8f5ef');
          ctx.shadowBlur = 0;
          ctx.save();
          ctx.beginPath();
          ctx.rect(-120, -178, 240, 341 * reveal);
          ctx.clip();
          ctx.drawImage(stripImage, -120, -178, 240, 341);
          ctx.restore();
          ctx.restore();
          ctx.textAlign = 'left';
          ctx.fillStyle = '#fff9f0';
          ctx.font = '37px Georgia';
          ctx.fillText('Your little memory', 665, 470);
          ctx.fillText('is taking shape.', 665, 516);
          ctx.fillStyle = '#ddc9d3';
          ctx.font = '20px Arial';
          ctx.fillText('Composing your three-pose strip', 665, 568);
          rounded(665, 602, 360, 7, 4, '#ffffff30');
          rounded(665, 602, 360 * progress, 7, 4, '#d2a0b2');
          ctx.font = '18px Arial';
          ctx.fillText(`${Math.round(progress * 100)}% · Putting it together`, 665, 650);
          ctx.font = '13px Arial';
          ctx.fillText('ILLUSTRATED PROCESSING SEQUENCE', 665, 705);
          ctx.strokeStyle = '#efd4df';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(1052, 483, 20, time * 3, time * 3 + 4.5);
          ctx.stroke();
        }

        // Reference-inspired chapter counter with continuous progress.
        const ringX = 1348,
          ringY = 281;
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#cdbdc2';
        ctx.beginPath();
        ctx.arc(ringX, ringY, 42, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#965a6c';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(ringX, ringY, 42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.stroke();
        ctx.fillStyle = '#633c50';
        ctx.font = 'bold 30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(String(Math.max(1, scene.step)).padStart(2, '0'), ringX, ringY + 10);
        ctx.font = '15px Arial';
        ctx.fillText(`${Math.round(progress * 100)}%`, ringX, 352);
        const labels = ['Open booth', 'Invite', 'Make it yours', 'Three poses', 'Your keepsake'];
        labels.forEach((label, i) => {
          const current = Math.max(1, scene.step) === i + 1;
          rounded(1285, 414 + i * 71, 126, 52, 10, current ? '#965a6c' : '#ffffff50');
          ctx.fillStyle = current ? '#fff9f0' : '#786570';
          ctx.font = `${current ? 'bold ' : ''}16px Arial`;
          ctx.fillText(label, 1348, 445 + i * 71);
        });
        ctx.textAlign = 'left';
        ctx.fillStyle = '#88737e';
        ctx.font = '14px Arial';
        ctx.fillText('A little closer, wherever you are.', 48, 1023);
        ctx.textAlign = 'right';
        ctx.fillText('ENGLISH VOICEOVER · NO MUSIC', 1392, 1023);
        ctx.textAlign = 'left';
        rounded(48, 1045, 1344, 4, 2, '#d6c5cc');
        rounded(48, 1045, 1344 * (time / total), 4, 2, '#965a6c');
      }

      const videoStream = canvas.captureStream(30);
      const stream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);
      const mimeType = 'video/mp4;codecs=avc1.42001E,mp4a.40.2';
      if (!MediaRecorder.isTypeSupported(mimeType))
        throw new Error('This Chrome cannot encode H.264 with AAC audio.');
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 4200000,
        audioBitsPerSecond: 128000,
      });
      const chunks = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      const stopped = new Promise((resolve) => {
        recorder.onstop = resolve;
      });
      const firstImage = await load(0);
      draw(firstImage, scenes[0], 0.7, 0, null);
      const poster = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
      recorder.start();
      const start = audio.currentTime + 0.15;
      buffers.forEach((buffer, i) => {
        const source = audio.createBufferSource();
        source.buffer = buffer;
        const gain = audio.createGain();
        gain.gain.value = 0.92;
        source.connect(gain).connect(destination);
        source.start(start + scenes[i].start + 0.15);
      });
      let lastScene, lastImage, previousImage;
      while (audio.currentTime - start < total) {
        const time = Math.max(0, audio.currentTime - start);
        const scene =
          scenes.find((s) => time >= s.start && time < s.start + s.duration) ?? scenes.at(-1);
        const elapsed = time - scene.start;
        const sourceTime =
          scene.from + Math.min(1, elapsed / scene.duration) * (scene.to - scene.from);
        let index = scene.first;
        while (index < scene.last && frames[index + 1].time <= sourceTime) index++;
        if (lastScene !== scene) {
          previousImage = lastImage;
          lastScene = scene;
        }
        const image = await load(index);
        lastImage = image;
        for (let next = index + 1; next <= Math.min(frames.length - 1, index + 3); next++)
          void load(next);
        for (const key of cache.keys()) if (key < index - 2 || key > index + 6) cache.delete(key);
        draw(image, scene, elapsed, time, previousImage);
        await new Promise((resolve) => setTimeout(resolve, 1000 / 30));
      }
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((track) => track.stop());
      await audio.close();
      const data = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(new Blob(chunks, { type: 'video/mp4' }));
      });
      return {
        data,
        poster,
        total,
        scenes: scenes.map(({ start, duration, text }) => ({
          start: start + 0.3,
          duration: duration - 0.3,
          text,
        })),
      };
    },
    {
      frames: frames.map(({ file, ...frame }) => frame),
      groups,
      storyboard,
      voices,
      strip: (await readFile(path.join(work, 'demo-strip.png'))).toString('base64'),
    },
  );
  await writeFile(path.join(output, 'twogether-demo.mp4'), Buffer.from(result.data, 'base64'));
  await writeFile(
    path.join(output, 'twogether-demo-poster.jpg'),
    Buffer.from(result.poster, 'base64'),
  );
  const timestamp = (seconds) => new Date(seconds * 1000).toISOString().slice(11, 23);
  await writeFile(
    path.join(output, 'twogether-demo.en.vtt'),
    'WEBVTT\n\n' +
      result.scenes
        .map(
          (scene, i) =>
            `${i + 1}\n${timestamp(scene.start)} --> ${timestamp(scene.start + scene.duration)}\n${scene.text}\n`,
        )
        .join('\n'),
  );
  await writeFile(
    path.join(work, 'narrated-timeline.json'),
    JSON.stringify(result.scenes, null, 2),
  );
  console.log(
    `Rendered narrated demo: ${result.total.toFixed(1)} seconds, with embedded voiceover.`,
  );
} finally {
  await browser.close();
}
