import assert from 'node:assert/strict';
import { build, createServer, preview } from 'vite';
import { chromium } from '@playwright/test';

// Development must serve JSON rather than Vite's HTML navigation fallback.
for (const base of ['/', '/TwoGetherBooth/']) {
  const server = await createServer({
    root: 'frontend',
    base,
    server: { host: '127.0.0.1', port: 4180, strictPort: true },
  });
  try {
    await server.listen();
    const response = await fetch(`http://127.0.0.1:4180${base}manifest.webmanifest`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /json|manifest/);
    assert.equal((await response.json()).name, 'TwoGether Booth');
    console.log(`Development manifest passed: ${base}`);
  } finally {
    await server.close();
  }
}

process.env.NODE_ENV = 'production';

// Exercise the real production worker: development mode deliberately has no worker.
for (const base of ['/', '/TwoGetherBooth/']) {
  await build({ root: 'frontend', base });
  const server = await preview({
    root: 'frontend',
    base,
    preview: { host: '127.0.0.1', port: 4179, strictPort: true },
  });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', (error) => console.log('PAGE ERROR', error.message));
    const origin = 'http://127.0.0.1:4179';
    await page.goto(origin + base);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) =>
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
        );
      }
    });
    const manifestURL = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await context.request.get(origin + manifestURL)).json();
    assert.equal(manifest.display, 'standalone');
    assert(manifest.icons.some((icon) => icon.purpose === 'maskable'));
    assert(manifest.icons.every((icon) => icon.purpose !== 'any maskable'));
    for (const screenshot of manifest.screenshots) {
      const response = await context.request.get(origin + base + screenshot.src);
      assert.equal(response.status(), 200);
      assert.match(response.headers()['content-type'], /image\/png/);
      const dimensions = await page.evaluate(
        async (url) => {
          const image = new Image();
          image.src = url;
          await image.decode();
          return `${image.naturalWidth}x${image.naturalHeight}`;
        },
        origin + base + screenshot.src,
      );
      assert.equal(dimensions, screenshot.sizes);
    }
    assert(manifest.screenshots.some((screenshot) => screenshot.form_factor === 'wide'));
    assert(manifest.screenshots.some((screenshot) => screenshot.form_factor === 'narrow'));
    for (const icon of manifest.icons) {
      const response = await context.request.get(origin + base + icon.src);
      assert.equal(response.status(), 200);
      assert.match(response.headers()['content-type'], /image\/png/);
    }
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: /Create a Booth/ }).waitFor({ timeout: 5000 });
    await page.goto(origin + base + '?room=private-test#private-token');
    const cachedURLs = await page.evaluate(async () => {
      const cache = await caches.open(
        (await caches.keys()).find((key) => key.startsWith('twogether-shell-')),
      );
      return (await cache.keys()).map((request) => request.url);
    });
    assert(cachedURLs.some((url) => url.endsWith(base + 'index.html')));
    assert(cachedURLs.every((url) => !url.includes('private-') && !url.includes('/demo/')));
    console.log(
      `PWA passed: ${base} (manifest, icons, offline reload, private URL cache exclusion)`,
    );
    await context.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
}
