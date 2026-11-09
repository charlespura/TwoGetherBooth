# TwoGether Booth

**Different places. One photo.** A private, temporary photobooth for two people, built with React, strict TypeScript, Vite, Tailwind CSS, WebRTC, Canvas, and a separate Node.js WebSocket signaling service.

No accounts, database, analytics, recording, or permanent media storage. The server holds room membership and ephemeral signaling state in memory. Each browser captures its own camera image, and the host composes a canonical three-row PNG with both partners beside one another. That exact PNG is transferred to the guest and verified with SHA-256.

## Repository

```text
frontend/                 Vite/React app; deploy to GitHub Pages or Vercel
  src/lib/booth.ts         session lifecycle and UI state
  src/lib/signaling.ts     WebSocket membership and reconnects
  src/lib/peer.ts          RTCPeerConnection and media tracks
  src/lib/transfer.ts      bounded/chunked data-channel transfers
  src/lib/capture.ts       coordinated capture protocol
  src/lib/render.ts        local snapshots and canonical Canvas composition
signaling/                separate persistent Node.js service
  src/rooms.ts            access rules, reservations, expiry, cleanup
shared/                   validated signaling and peer-message schemas
docs/TWO_DEVICE_TEST.md    practical release checklist
```

## Local setup

Use Node.js **22.12+** (Node 24 LTS recommended) and npm. From the repository root:

```powershell
npm.cmd ci
Copy-Item frontend/.env.example frontend/.env
Copy-Item signaling/.env.example signaling/.env
npm.cmd run dev
```

On macOS/Linux use `npm` instead of `npm.cmd`, and `cp` instead of `Copy-Item`. The Windows `.cmd` suffix avoids PowerShell execution-policy restrictions; no policy change is necessary.

Open **http://localhost:5173**. Signaling listens at **http://localhost:8787**, with WebSockets at `/ws` and a minimal `/health` endpoint. Open a booth, explicitly enable your camera, enter, and copy the invitation. Open that link on a second browser/device and approve its request on the host. Both press Ready; the host starts capture. Never expect a partner video until a real second participant has joined.

Separate terminals are also supported:

```text
npm run dev -w frontend
npm run dev -w signaling
```

The frontend defaults to `ws://localhost:8787` only on localhost/127.0.0.1. A deployed site requires `VITE_SIGNAL_URL`; it never silently substitutes demo video. Changes to frontend environment variables require a new build.

## Narrated product demo

The home page's **Watch demo** button opens an English-narrated video walkthrough with illustrated demo cameras,
animated chapter progress, gentle transitions, and a photo-strip processing sequence. There is no music.
The video and poster are served from `frontend/public/demo/` and included automatically in Vite's
production build, including Vercel deployments. No video hosting service or extra configuration is needed.
The player supports pause, seeking, fullscreen, English captions, a download link, and a written walkthrough.
Voiceover is embedded in the MP4 and stays synchronized when pausing or seeking. If the browser blocks
autoplay with sound, tap the native play control.

To regenerate the video, start the local frontend and signaling services, then run in another terminal:

```powershell
npm.cmd run demo:record
```

The recorder requires installed Google Chrome and Windows with the Microsoft Zira Desktop speech voice.
It runs two isolated browsers through the real booth flow using illustrated camera streams, generates
local narration from `scripts/demo-storyboard.json`, then renders a 1440×1080 H.264 MP4 with AAC audio.
The processing sequence is an illustrated transition in the demo. Recording cameras are supplied only
by `scripts/create-demo.mjs`; visitors use their own cameras as usual. Temporary frames and voice clips
are ignored in `.demo-work/`. Generated MP4, poster, and VTT captions live in `frontend/public/demo/`;
production builds need no Windows speech service.

To revise narration or animation using existing recording frames:

```powershell
powershell.exe -NoProfile -File scripts/narrate-demo.ps1
npm.cmd run demo:render
```

## Configuration

See both `.env.example` files. Never commit real `.env` files.

| Variable             | Service        | Meaning                                                                                                                          |
| -------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_SIGNAL_URL`    | Frontend       | Public `wss://your-signal-host.example` (path is normalized to `/ws`). All `VITE_` values are public.                            |
| `PORT`               | Signaling      | HTTP and WebSocket port, default 8787; hosts such as Render supply this.                                                         |
| `ALLOWED_ORIGINS`    | Signaling      | Comma-separated **exact** frontend origins, without trailing slash; no wildcard.                                                 |
| `STUN_URLS`          | Signaling      | Comma-separated `stun:` URLs; defaults to Google's public STUN service. Set empty to disable.                                    |
| `TURN_URLS`          | Signaling      | Comma-separated `turn:` / `turns:` URLs supported by your coturn service.                                                        |
| `TURN_SHARED_SECRET` | Signaling only | coturn REST shared secret. Never a frontend variable or committed file.                                                          |
| `TURN_TTL_SECONDS`   | Signaling      | Expiring credential lifetime, 7200–86400, default 10800 seconds.                                                                 |
| `TRUST_PROXY`        | Signaling      | Default false. Set true only behind a trusted proxy which overwrites `X-Forwarded-For`; otherwise IP rate limits can be spoofed. |

## Frontend deployment: GitHub Pages

The workflow in `.github/workflows/pages.yml` builds only the frontend and publishes
`frontend/dist` on pushes to `main`. It sets Vite's base path from the Pages configuration,
so scripts, styles, the favicon, and demo media work under `/TwoGetherBooth/`.

1. In the GitHub repository, open **Settings > Pages** and set **Source** to **GitHub Actions**
   (instead of **Deploy from a branch**).
2. Commit and push these changes to `main`. Open **Actions > Deploy frontend to GitHub Pages**
   and wait for a successful deployment. You can also use **Run workflow** after the workflow is on `main`.
3. Open **https://charlespura.github.io/TwoGetherBooth/**.

You can publish the landing page and narrated demo first without a signaling server.
Creating/joining live booths requires the separate Node signaling service described below;
GitHub Pages serves the static frontend only.

When signaling is deployed, add a repository **Actions variable** under
**Settings > Secrets and variables > Actions > Variables**:
`VITE_SIGNAL_URL=wss://YOUR-SIGNAL-SERVICE.onrender.com`.
Set the signaling service's `ALLOWED_ORIGINS` to `https://charlespura.github.io`
(the origin excludes `/TwoGetherBooth/`). Then rerun the Pages workflow to rebuild the frontend.
No TURN secrets belong in frontend variables. Until signaling is configured, booth actions
show a configuration error; the landing page and demo remain available.

GitHub Pages does not apply the custom response headers in `frontend/vercel.json`.
The HTML referrer policy remains in place, but Vercel-specific CSP and other response headers
are not supplied by this deployment.

See [Vite's GitHub Pages guide](https://vite.dev/guide/static-deploy#github-pages).

## Frontend deployment: Vercel (alternative)

The hosting instructions were checked against official documentation on **26 October 2026**: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Vercel WebSockets and persistent state](https://vercel.com/docs/functions/websockets), [Render WebSockets](https://render.com/docs/websocket), [Render Node deployment](https://render.com/docs/deploy-node-express-app), and [Render free instance limits](https://render.com/docs/free).

1. Put this repository in your Git provider, then import it into Vercel.
2. Set **Root Directory** to `frontend` and enable **Include source files outside of the Root Directory in the Build Step** because this is an npm workspace with `shared/` sources.
3. Choose framework **Vite**. Set install command to `cd .. && npm ci`, build command to `npm run build`, output directory to `dist`. The tracked `frontend/vercel.json` supplies build/output settings and privacy/security response headers.
4. Add `VITE_SIGNAL_URL=wss://YOUR-SIGNAL-SERVICE.onrender.com` to production (and any preview environment you use), then deploy.
5. Add the exact Vercel production origin to the signaling service's `ALLOWED_ORIGINS`. Add preview origins explicitly if needed; never use `*`. Redeploy the signaling service after configuration changes.

Invitation tokens are in the URL **fragment**, so they are not sent in normal HTTP page requests. This app uses a single path with hash invitations and needs no SPA rewrite. The CSP accepts secure WebSocket hosts; it never accepts scripts from a third-party CDN.

This implementation deliberately keeps all signaling state off Vercel Functions. Current Vercel documentation describes WebSocket support, but warns that instance memory is not shared and connections have function-duration limits. That is incompatible with this project's single-process, in-memory room model. No Vercel function memory, database, or storage service is used.

## Signaling deployment: Render (or equivalent Node host)

Use a **Web Service**, not a static site or serverless function. From Render's dashboard connect the repository:

| Setting           | Value                                    |
| ----------------- | ---------------------------------------- |
| Runtime           | Node                                     |
| Root Directory    | Leave empty (repository root)            |
| Build Command     | `npm ci && npm run build -w signaling`   |
| Start Command     | `npm run start -w signaling`             |
| Health Check Path | `/health`                                |
| Instance count    | **Exactly 1**, with autoscaling disabled |

Set Node 24, `ALLOWED_ORIGINS`, and your STUN/TURN environment variables. Render supplies `PORT`; the server binds `0.0.0.0`. Use its public **wss://** address in Vercel. If enabling `TRUST_PROXY`, verify your host's proxy header handling first. With it disabled, clients behind one reverse proxy may share rate limits.

An equivalent VPS/container host works if it supports long-running Node and WebSocket upgrades, terminates trusted TLS, forwards `/ws`, and runs exactly one process. Do not use a Node cluster, multiple replicas, horizontal autoscaling, or rolling deployments with two live versions: room routing and membership would diverge. Every restart/redeploy loses rooms; users must create a new booth. Scaling requires a different shared-state design and is outside this initial implementation.

**Costs and availability:** Render's free tier can sleep after 15 minutes without inbound traffic and can take about a minute to wake. Free instance hours, builds, bandwidth quotas, and service restarts can interrupt access. An initial client connection times out after 12 seconds, so a cold service may require a later retry. An always-on paid instance is the practical choice for reliable date nights. Web hosting and TURN bandwidth can incur charges; no plan is claimed to be free or unlimited. Check provider pricing and quotas before launch. Automatic approval of this project does not purchase hosting.

## STUN / TURN

STUN alone works for some network combinations. Different Wi-Fi/mobile networks, carrier NAT, and restrictive firewalls often require TURN. Supply a real TURN service before considering the app dependable across networks.

The implemented credential scheme is the [coturn REST shared-secret scheme](https://github.com/coturn/coturn/blob/master/README.turnserver): `expiry:random` usernames and Base64 HMAC-SHA1 credentials. Configure coturn's `use-auth-secret`, `static-auth-secret`, realm, TLS certificates, relay ports, firewall rules, and capacity on your own relay host. Restrict relay access to private/link-local destinations using coturn's peer-address restrictions, and set allocation/bandwidth limits appropriate to your budget. Example signaling values (placeholders only):

```dotenv
TURN_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349?transport=tcp
TURN_SHARED_SECRET=REPLACE_ON_THE_SIGNALING_HOST_ONLY
TURN_TTL_SECONDS=10800
```

Only short-lived credentials go to admitted browsers. The private signing secret stays on the signaling host. A guest gets ICE configuration only after host approval; anonymous hosts can create rooms within rate limits, so apply provider quotas and monitoring. A managed TURN provider must support this shared-secret scheme; adapt `ice.ts` to its server-side credential API if it does not. Never paste long-lived provider secrets into `VITE_` variables.

TURN relays encrypted WebRTC traffic while a connection is active. **It is not permanent media storage.** The signaling service cannot act as a TURN relay. Public STUN and relay providers can observe network metadata such as IP addresses; direct WebRTC also exposes network addresses to your chosen partner. The invitation is a bearer secret, and host approval is a human check, not identity authentication.

## Testing a phone camera through HTTPS

`http://192.168.x.x:5173` is generally **not a secure context** on a phone, so it cannot access the camera. The phone's `localhost` refers to the phone, not your computer.

The easiest realistic test is a Vercel HTTPS frontend plus an independently deployed WSS signaling service. Alternatively use trusted HTTPS tunnels (for example your chosen tunnel provider) for both local ports:

1. Start both local services.
2. Tunnel port 8787 to obtain an HTTPS/WSS hostname. Set the frontend's `VITE_SIGNAL_URL` to its `wss://` hostname.
3. Tunnel port 5173 to obtain the public frontend HTTPS origin. Add that exact origin to `ALLOWED_ORIGINS` and restart the signaling server. Restart Vite after changing its environment.
4. Vite may require that tunnel hostname in `server.allowedHosts`; add only the exact hostname in `frontend/vite.config.ts`. Do not set unrestricted allowed hosts.
5. Open the **HTTPS** frontend URL on the phone and use invitation links from that origin. A HTTPS frontend must connect to **WSS**, not `ws://`.

A locally trusted certificate plus Vite's HTTPS configuration is another option, but the issuing CA must be trusted on **each** test device. Do not bypass certificate warnings; fix trust and TLS instead. Tunnels expose your dev services publicly, so use them only while testing and close them afterward. Browser permission prompts still require each person's consent.

## Capture and transfer behavior

- Each participant explicitly readies their own live camera. Only the host starts capture; changing a camera clears readiness.
- Host ping/pong samples estimate the guest's monotonic-clock offset. At least three samples are required; the sample with the lowest round-trip time supplies the offset.
- A unique capture ID and future target time are prepared, accepted, and committed. Both devices schedule the same three absolute targets 3.5 seconds apart. A late confirmation cancels instead of producing unrelated timers. Only one capture can run at a time.
- Each device captures its **local** video at 640×480, mirrored to match its preview, as bounded JPEGs (maximum 240 KB). The remote compressed video is never used as the source of a partner's still photo.
- Reliable ordered WebRTC data messages carry 16 KB binary chunks, with high/low buffered-amount backpressure, transfer deadlines, bounded allocation, and SHA-256 verification. Maximum final PNG is 3.5 MB. The host renders a 1000×1420 strip, sends one canonical PNG, and waits for the guest's receipt acknowledgment.
- Different camera pipelines and asymmetric network latency still cause timing differences. This is a coordinated capture, not hardware synchronization. Keep both tabs visible; a camera paused or a capture callback more than 750 ms late cancels the session. Mobile background suspension is not supported.
- Cancel, track loss, partner disconnect, or transfer failure resets capture/readiness. Neither participant may overlap capture sessions. Images and strips live only in browser memory/object URLs and are cleared on retake/discard/leave or page close. Browser memory release is garbage-collected, not a forensic secure erase. Downloads/shared copies remain wherever users saved them.

## Rooms, reconnects, and privacy

Rooms use 192-bit random invitation tokens, separate peer resume secrets, and host-approved admission. One pending join reserves the only guest seat and expires in 45 seconds. Rooms expire after two hours. A disconnected member has a 30-second grace period; abandoned host rooms are deleted, and guest seats are released. Cleanup runs every five seconds.

The browser reconnects signaling with exponential backoff for up to about 30 seconds, retaining its resume secret **only in memory**. Refreshing the page loses membership. On a signaling interruption, peers and captures reset; a successful resume creates a fresh WebRTC connection and both must ready up again. After grace expires or the server restarts, create/rejoin a booth. Explicit host leave ends the room; explicit guest leave frees the seat.

The server validates JSON with Zod, caps WebSocket payloads at 32 KB, enforces per-socket traffic limits, limits connections/room creation/join attempts, limits total clients/rooms, checks origins, sends heartbeat pings, and cleans abandoned entries. It logs startup only, never invitation tokens, photos, SDP, candidates, or client IPs. Configure external proxy/hosting logs to avoid recording WebSocket bodies or sensitive data too. These are basic abuse controls, not a full public-service anti-abuse system. No media is written to localStorage, a database, or the signaling filesystem.

Microphones begin off and are requested only on explicit enable. Remote sound has a separate Hear partner control to accommodate autoplay restrictions and personal preference. Leaving stops local tracks and closes the socket, peer connection, transfers, callbacks, and timers. PNG object URLs are revoked on replacement/unmount.

## Verification

```text
npm run typecheck
npm run lint
npm test
npm run build
npm run test:browser
```

Unit tests cover host approval, two-person capacity, pending/abandoned cleanup, resume credentials, expiry, message bounds, rate limiting, temporary TURN credentials, coordinated targets, overlap protection, capture confirmation, stale IDs, cancellation, chunking, backpressure, and corrupted image rejection. The browser tests require installed Google Chrome and use independent headless Chrome processes with **synthetic test cameras**. They check responsive layouts, approval, live WebRTC video in both directions, countdown visibility on mobile, matching PNG hashes, discard/retake previews, and leaving. Test servers start automatically; ports 5173/8787 must be free or running this same project. Synthetic sources are browser-runner flags only and are never part of the production app.

See [the two-device checklist](docs/TWO_DEVICE_TEST.md) before a public launch. Automated or same-machine tests do not prove physical two-device capture or cross-network TURN connectivity.

No hosting credentials or TURN secret are included. To launch publicly, connect your own Vercel/Node hosting accounts, set both public origins/URLs, and configure TURN. Deployment instructions and configuration are included; a deployed URL must be verified separately.
