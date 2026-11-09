# TwoGether Booth: two-device release checklist

Use two actual devices and two consenting people. Record device/browser versions, frontend URL, signaling version, networks, and results. Do not record room tokens or private media in issue logs. A same-machine browser test with synthetic media does **not** satisfy this checklist.

## Secure camera setup

- [ ] Test current Safari on iPhone, Chrome on Android, and Chrome/Edge/Firefox on desktop as available.
- [ ] Use trusted HTTPS frontend and WSS signaling; confirm no mixed-content or certificate warnings.
- [ ] Confirm camera permission is requested only after Enable camera. The microphone starts off and requires a separate action.
- [ ] Deny camera permission, then verify the site-setting recovery instructions. Retry after granting it.
- [ ] Test no camera, camera occupied by another app, unplugged camera, and unsupported camera selection.
- [ ] Preview before entering; switch available lenses/cameras. Ensure old tracks stop and readiness resets.
- [ ] Test portrait/landscape and 320, 375, 390, 768, and 1440 px widths; no horizontal scroll. On mobile, both cameras must fit during countdowns and controls must respect the safe area.
- [ ] Test keyboard navigation, visible focus, labels, status announcements, 200% zoom, and reduced motion.

## Room admission

- [ ] Create a booth, copy its unguessable hash invitation, and share privately. Test native share where available and manual copy fallback.
- [ ] Guest previews first, asks to join, and waits; neither peer sees the other before host approval.
- [ ] Test both approve and decline. Treat the optional name as unverified text.
- [ ] A third participant sees room full during pending approval and after admission. An unguessable/expired room shows an actionable error.
- [ ] Close an unapproved guest tab; pending approval disappears. Wait 45 seconds to test approval expiry.

## Live media and coordinated capture

- [ ] Both previews show **real live movement** from their own cameras. Neither panel substitutes a sample video.
- [ ] Check camera off/on, microphone mute/unmute, explicit partner audio enable, and mobile autoplay recovery. Avoid feedback by using headphones.
- [ ] Both partners explicitly become ready. Capture stays disabled until both are ready; only the host starts it.
- [ ] Observe three shared countdowns while both remain visible. Hold up moving clocks or fingers to assess timing differences; do not expect hardware synchronization.
- [ ] Confirm each final row contains host left and guest right, captured from the respective **local** cameras, with three distinct poses.
- [ ] Test Classic cream, Rose scrapbook, Black & white, long names/captions, and dates. Verify guest sees the host's settings.
- [ ] Observe snapshot/transfer progress on slow networks; the host should not overlap captures. Cancel during countdown and during transfer, then retake successfully.
- [ ] Download both PNGs and compare SHA-256 hashes: `Get-FileHash <file> -Algorithm SHA256` (PowerShell), or `shasum -a 256 <file>` (macOS). Hashes must match.
- [ ] Verify native file sharing where supported and download fallback elsewhere. Check downloads manually; the site must not claim gallery autosave.
- [ ] Retake/discard on each side; both open pages clear the current strip. Previously downloaded files remain on the device.

## Real network matrix — TURN required for release confidence

- [ ] Two devices on the same Wi-Fi.
- [ ] Devices on two **different Wi-Fi networks**.
- [ ] Wi-Fi versus **mobile data**, with Wi-Fi disabled on the mobile-data device.
- [ ] Both devices on mobile data, ideally different carriers.
- [ ] A restrictive network where direct ICE fails. Confirm a **relay** candidate pair is selected in browser WebRTC diagnostics using your configured TURN service; complete a strip over that relay.
- [ ] Check temporary TURN expiry and provider capacity/bandwidth quotas. Verify the shared secret is absent from frontend assets and client messages; only expiring credentials may be present.

## Failures and cleanup

- [ ] Briefly disconnect each device. Capture cancels; signaling retries explicitly. Resume within 30 seconds, establish fresh cameras, and ready up again.
- [ ] Disconnect for more than 30 seconds. The guest seat is released or host room expires; recovery offers a new/rejoined booth.
- [ ] Kill/restart the signaling process. In-memory rooms disappear and clients show expiry/error; never fall back to demo mode.
- [ ] Close or background a camera tab during capture. Verify cancellation/timeout and useful recovery. Mobile browser suspension may break the connection.
- [ ] Simulate slow/stalled transfer, rejected permission, offline signaling, and absent TURN. Errors must remain visible and capture locks must eventually release.
- [ ] Leave as guest: host sees partner left and can invite again. Leave as host: guest sees room ended.
- [ ] Leave the site and confirm camera/microphone indicators turn off. Check for repeated sockets, tracks, event listeners, timers, and object URLs after several retakes.
- [ ] Test two-hour expiry and abandoned-room cleanup (automated tests use a short injected clock).
- [ ] Confirm no media in server logs/files, localStorage, database, or analytics. TURN traffic is transit, not media storage.

## Sign-off

Date: ______ Frontend deployment: ______ Signaling deployment: ______

Devices / browsers / networks: ______

Completed by: ______ Remaining failures: ______

No physical two-device or cross-network test is implied by the presence of this checklist.
