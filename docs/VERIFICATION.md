# Implementation verification

Date: **26 October 2026 (Asia/Manila)**.

## Passed

- `npm run typecheck`: strict frontend and signaling TypeScript checks.
- `npm run lint`: no ESLint errors or warnings.
- `npm test`: **20 tests across 4 files**, covering room access, host approval, capacity, expiry, abandoned/pending cleanup, resume secrets, rate limits, message limits, expiring TURN credentials, clock offsets, coordinated capture targets, overlap protection, cancellation, stale IDs, image chunking, backpressure, and corrupted-transfer rejection.
- `npm run build`: Vite production frontend and bundled Node signaling service.
- `npm run dev`: both documented development services started successfully, and the frontend and `/health` endpoint returned HTTP 200. `npm ci --dry-run --offline` also confirmed the lockfile is consistent.
- `npm run test:browser`: **2 passing automated Chrome tests**. Responsive landing/join/setup checks at 320, 375, 390, 768, and 1440 px. Independent Chrome processes with synthetic camera devices connected through the actual local WebSocket server and WebRTC. Both partners received live remote video, synchronized settings, and a shared three-pose countdown. Both downloaded **byte-identical PNGs**, verified with SHA-256, at **1000 × 1420** pixels. Both camera panels remained visible during the mobile countdown. Discard restored live previews, and guest leave updated host presence.
- Screenshots of desktop/mobile landing, the live booth, and mobile results were inspected. The production signaling service's `/health` endpoint was exercised by the browser test runner.

Synthetic media is configured only in the test runner. The application contains no simulated partner video or demo connection fallback.

## Still requires external setup / physical testing

- No public Vercel or persistent Node deployment was performed: hosting access and production URLs were not supplied/configured. Follow the deployment steps in the root README.
- No real TURN relay credentials were supplied. Credential generation is unit tested; relay connectivity and billing/capacity are unverified.
- No physical two-device camera test, iOS/Android hardware test, native OS image-share test, different-Wi-Fi test, or Wi-Fi/mobile-data test was performed. Complete `TWO_DEVICE_TEST.md` before release.
- Browser automation uses a single computer and does not establish cross-network reliability or hardware-level capture synchronization.

The initial server intentionally runs as **one instance** with in-memory rooms. Restarts erase rooms. Real frontend/server environment files and long-lived secrets are excluded from the repository.
