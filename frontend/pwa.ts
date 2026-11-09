import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** Precache only the app shell, never demo video, invitations, or user media. */
export function pwa(): Plugin {
  let base = '/';
  let publicDir = '';
  return {
    name: 'booth-pwa',
    enforce: 'post',
    apply: 'build',
    configResolved(config) {
      base = config.base;
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter((name) => /\.(?:js|css|html)$/.test(name));
      const revision = createHash('sha256');
      for (const name of assets.sort()) {
        const asset = bundle[name];
        revision.update(asset.type === 'chunk' ? asset.code : asset.source);
      }
      const files = [
        ...assets,
        'favicon.svg',
        'manifest.webmanifest',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/maskable-512.png',
      ];
      for (const name of files.filter((name) => !assets.includes(name))) {
        revision.update(readFileSync(resolve(publicDir, name)));
      }
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `
const CACHE = 'twogether-shell-${revision.digest('hex').slice(0, 16)}';
const PREFIX = 'twogether-shell-';
const ROOT = new URL('./', self.location.href);
const FILES = ${JSON.stringify(files)}.map(file => new URL(file, ROOT).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
// Let existing tabs finish their sessions before activating an update.
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  // Navigation URLs may contain room secrets: never store them as cache keys.
  if (request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(new URL('index.html', ROOT).href))
      .then(response => response || fetch(request)));
  } else if (FILES.includes(url.href)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(request, { ignoreVary: true }))
      .then(response => response || fetch(request)));
  }
});
`,
      });
      if (!base.startsWith('/'))
        this.warn(
          'PWA deployment requires an absolute pathname base, such as / or /TwoGetherBooth/.',
        );
    },
  };
}
