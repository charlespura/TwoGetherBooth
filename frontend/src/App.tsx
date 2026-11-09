import { useEffect, useState, useSyncExternalStore, useCallback } from 'react';
import {
  Camera,
  Heart,
  ArrowUpRight,
  ArrowRight,
  Link2,
  LockKeyhole,
  Video,
  VideoOff,
  Mic,
  MicOff,
  LogOut,
  Copy,
  Share2,
  Check,
  RotateCcw,
  X,
  ShieldCheck,
  Sparkles,
  Users,
  ChevronDown,
  Play,
} from 'lucide-react';
import { Booth } from './lib/booth';
import { CameraPanel } from './components/CameraPanel';
import { FramePicker, MiniStrip } from './components/FramePicker';
import { Results } from './components/Results';
import { DemoVideo } from './components/DemoVideo';
import { canCapture } from './lib/capture-plan';

const statusWords: Record<string, string> = {
  waiting: 'Waiting for your person',
  connecting: 'Connecting your cameras',
  connected: 'Together in the booth',
  reconnecting: 'Reconnecting',
  left: 'Your person has left',
  expired: 'This booth has ended',
  full: 'This booth is full',
  error: 'Connection needs attention',
  approval: 'Waiting for host approval',
  idle: 'Your little corner of the internet',
};
function App() {
  const [booth] = useState(() => new Booth());
  const [demoOpen, setDemoOpen] = useState(false);
  const s = useSyncExternalStore(booth.subscribe, booth.snapshot);
  const [joinOpen, setJoinOpen] = useState(false),
    [joinLink, setJoinLink] = useState(''),
    [joinError, setJoinError] = useState('');
  const videoRef = useCallback(
    (v: HTMLVideoElement | null) => {
      booth.video = v;
    },
    [booth],
  );
  useEffect(() => {
    booth.mount();
    return () => booth.dispose();
  }, [booth]);
  const join = () => {
    let token = joinLink.trim();
    try {
      token = new URLSearchParams(new URL(token).hash.slice(1)).get('room') ?? token;
    } catch {
      /* A room token is also accepted. */
    }
    if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) {
      setJoinError('Paste the full invitation link your person sent you.');
      return;
    }
    setJoinOpen(false);
    booth.setup('join', token);
  };
  const host = s.member?.role === 'host';
  // Keep media sinks attached while viewing results so retakes resume the live session.
  const active = s.stage === 'session' || s.stage === 'result';
  return (
    <div className="app-shell">
      <header className="site-header content-width">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            booth.leave();
          }}
          aria-label="TwoGether Booth home"
        >
          <span className="brand-icon">
            <Camera size={23} />
            <Heart size={9} fill="currentColor" />
          </span>
          <span>
            TwoGether<span className="brand-booth">BOOTH</span>
          </span>
        </a>
        {s.stage === 'landing' ? (
          <nav aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#just-us">
              Just the two of you <LockKeyhole size={13} />
            </a>
          </nav>
        ) : (
          <div className="header-right">
            <span
              className={`connection-pill ${s.status === 'connected' ? 'online' : ''}`}
              role="status"
            >
              <i />
              {statusWords[s.status] ?? 'Camera setup'}
            </span>
            <button
              className="text-button leave-button"
              aria-label={s.stage === 'setup' ? 'Back' : 'Leave booth'}
              onClick={() => booth.leave()}
            >
              <LogOut size={16} />
              <span>{s.stage === 'setup' ? 'Back' : 'Leave'}</span>
            </button>
          </div>
        )}
      </header>
      {s.stage === 'landing' && (
        <>
          <main className="landing content-width">
            <div className="hero-copy">
              <div className="eyebrow">
                <span /> A LITTLE LESS DISTANCE. A LITTLE MORE US.
              </div>
              <h1>
                Different places.
                <br />
                <em>One photo.</em>
                <span className="headline-heart">
                  <Heart />
                </span>
              </h1>
              <p className="hero-description">
                Open a booth, invite your person, and make a little memory together.
              </p>
              <div className="hero-actions">
                <button className="button primary" onClick={() => booth.setup('create')}>
                  <Camera size={19} /> Create a Booth <ArrowUpRight size={18} />
                </button>
                <button
                  className="button secondary"
                  onClick={() => {
                    setJoinOpen(true);
                    setJoinError('');
                  }}
                >
                  <Link2 size={18} /> Join a Booth
                </button>
              </div>
              <button className="demo-trigger" onClick={() => setDemoOpen(true)}>
                <span className="demo-play">
                  <Play size={13} fill="currentColor" />
                </span>
                Watch demo <span className="demo-trigger-note">With voiceover · No music</span>
              </button>
              <div className="hero-reassurance">
                <span>
                  <Check size={14} /> No account required
                </span>
                <span>
                  <DownloadIcon /> Download to your device
                </span>
              </div>
              <div className="handwritten hero-handwritten">
                a date night, from anywhere{' '}
                <svg width="45" height="28" viewBox="0 0 45 28" aria-hidden="true">
                  <path
                    d="M2 22C24 30 37 14 37 3m-8 6 8-7 5 9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                </svg>
              </div>
            </div>
            <div
              className="hero-art"
              aria-label="An illustrated example of a shared three-pose photo strip"
            >
              <div className="orbit-text">
                <Sparkles size={17} /> TWO PLACES, ONE LITTLE MEMORY
              </div>
              <div className="paper-card back-paper">
                <Heart size={34} strokeWidth={1} />
                <span>you + me</span>
                <small>wherever we are.</small>
              </div>
              <div className="hero-strip">
                <span className="tape" />
                <MiniStrip portraits />
                <span className="illustration-label">ILLUSTRATED STRIP PREVIEW</span>
              </div>
              <div className="art-note handwritten">
                side by side.
                <br />
                even from afar.
                <Heart size={18} />
              </div>
              <div className="memory-stamp">
                MADE
                <br />
                <Heart size={13} />
                <br />
                TOGETHER
              </div>
            </div>
          </main>
          <section className="how-section content-width" id="how-it-works">
            <div className="how-heading">
              <span className="section-eyebrow">YOUR NEXT LITTLE TRADITION</span>
              <h2>Three steps. Just us.</h2>
            </div>
            <div className="how-step">
              <span>01</span>
              <div>
                <h3>Open your little booth</h3>
                <p>Check your camera. Get comfortable.</p>
              </div>
            </div>
            <div className="how-step">
              <span>02</span>
              <div>
                <h3>Send a little invitation</h3>
                <p>A private link, for your favorite person.</p>
              </div>
            </div>
            <div className="how-step">
              <span>03</span>
              <div>
                <h3>Make a memory together</h3>
                <p>Three poses. One strip. Yours to keep.</p>
              </div>
            </div>
          </section>
          <section className="privacy-section content-width" id="just-us">
            <ShieldCheck size={25} />
            <div>
              <h2>A moment for two. A keepsake for you.</h2>
              <p>
                No accounts. No server photo storage. Your cameras connect privately with WebRTC;
                download or share your strip to keep it.
              </p>
            </div>
            <Heart size={24} strokeWidth={1} />
          </section>
        </>
      )}
      {s.stage === 'setup' && (
        <main className="setup-page content-width">
          <div className="setup-heading">
            <span className="section-eyebrow">
              {s.intent === 'join' ? 'AN INVITATION TO BE CLOSER' : 'LET’S MAKE A LITTLE MEMORY'}
            </span>
            <h1>
              {s.intent === 'join' ? 'Your person is waiting.' : 'First, find your good side.'}
            </h1>
            <p>Your camera, your comfort. Take a peek before you step inside.</p>
          </div>
          <div className="setup-grid">
            <CameraPanel
              stream={s.stream}
              local
              enabled={s.camera}
              name={s.name || 'You'}
              onVideo={videoRef}
            />
            <div className="setup-controls">
              <div className="step-label">
                01 <span>GET COMFORTABLE</span>
              </div>
              <h2>A quick hello to your camera.</h2>
              <p>Camera access begins when you tap below. Your microphone starts off.</p>
              <label>
                What should we call you? <span>(optional)</span>
                <input
                  value={s.name}
                  maxLength={32}
                  placeholder="Your first name"
                  onChange={(e) => booth.update({ name: e.target.value })}
                />
              </label>
              <button
                className={`button ${s.camera ? 'secondary' : 'primary'} w-full`}
                disabled={s.mediaBusy}
                onClick={() => void booth.openCamera()}
              >
                <Camera size={18} />
                {s.mediaBusy ? 'Opening camera…' : s.camera ? 'Restart camera' : 'Enable camera'}
              </button>
              {s.devices.length > 1 && (
                <CameraSelect
                  devices={s.devices}
                  busy={s.mediaBusy}
                  current={s.stream?.getVideoTracks()[0]?.getSettings().deviceId}
                  change={(id) => void booth.openCamera(id)}
                />
              )}
              {s.stream && (
                <button
                  className="text-button mic-setup"
                  disabled={s.mediaBusy}
                  onClick={() => void booth.microphone()}
                >
                  {s.mic ? <Mic size={16} /> : <MicOff size={16} />}{' '}
                  {s.mic ? 'Microphone on — mute' : 'Microphone off — enable'}
                </button>
              )}
              <div className="setup-divider" />
              <button
                className="button primary w-full"
                disabled={
                  !s.camera ||
                  s.mediaBusy ||
                  ['connecting', 'approval', 'reconnecting'].includes(s.status)
                }
                onClick={() => booth.enter()}
              >
                {s.status === 'approval'
                  ? 'Waiting for approval…'
                  : s.status === 'connecting'
                    ? 'Opening your booth…'
                    : s.intent === 'create'
                      ? 'Create my private booth'
                      : 'Ask to join the booth'}
                <ArrowRight size={18} />
              </button>
              <p className="privacy-note">
                <LockKeyhole size={14} />{' '}
                {s.intent === 'join'
                  ? 'The host approves your request before your cameras connect.'
                  : 'You’ll get a private invitation link. Only let your person in.'}
              </p>
            </div>
          </div>
          <Feedback
            error={s.error}
            notice={s.notice}
            clear={() => booth.update({ error: '', notice: '' })}
          />
        </main>
      )}
      {active && (
        <main className="booth-page content-width" hidden={s.stage === 'result'}>
          <div className="booth-heading">
            <div>
              <span className="section-eyebrow">YOUR PRIVATE LITTLE PHOTOBOOTH</span>
              <h1>
                Here’s to <em>being here.</em>
              </h1>
              <p>Different places, but this moment is yours.</p>
            </div>
            {s.member && (
              <div className="invite-actions">
                <button className="button secondary compact" onClick={() => void booth.copy()}>
                  <Copy size={15} /> Copy invite link
                </button>
                {typeof navigator.share === 'function' && (
                  <button
                    className="icon-button"
                    aria-label="Share private invitation"
                    onClick={() => void booth.shareInvite()}
                  >
                    <Share2 size={18} />
                  </button>
                )}
              </div>
            )}
          </div>
          {s.pending && (
            <div className="approval-banner" role="alert">
              <Users size={22} />
              <div>
                <strong>{s.pending.name || 'Someone'} would like to join.</strong>
                <p>Only approve if you were expecting your person.</p>
              </div>
              <button className="button primary compact" onClick={() => booth.approve(true)}>
                Let them in
              </button>
              <button className="button secondary compact" onClick={() => booth.approve(false)}>
                Decline
              </button>
            </div>
          )}
          <Feedback
            error={s.error}
            notice={s.notice}
            clear={() => booth.update({ error: '', notice: '' })}
          />
          {s.error && (
            <div className="error-actions">
              {s.member ? (
                <button className="text-button" onClick={() => booth.retry()}>
                  <RotateCcw size={15} /> Retry connection
                </button>
              ) : (
                <button
                  className="text-button"
                  onClick={() => {
                    booth.leave();
                    booth.setup('create');
                  }}
                >
                  Open a new booth <ArrowRight size={15} />
                </button>
              )}
            </div>
          )}
          <div className="booth-layout">
            <div className="workspace">
              <div className="camera-grid">
                <CameraPanel
                  stream={s.stream}
                  local
                  enabled={s.camera}
                  name={s.name || 'You'}
                  ready={s.ready}
                  onVideo={videoRef}
                  count={s.progress.count}
                  pose={s.progress.pose}
                />
                <CameraPanel
                  stream={s.remote}
                  enabled={s.partnerCamera}
                  name={s.partnerName}
                  ready={s.partnerReady}
                  status={statusWords[s.status]}
                  count={s.progress.count}
                  pose={s.progress.pose}
                />
              </div>
              <div className="camera-toolbar">
                <div className="media-buttons">
                  <button
                    className={`control-button ${!s.camera ? 'off' : ''}`}
                    disabled={s.progress.busy || s.mediaBusy}
                    onClick={() => booth.toggleCamera()}
                  >
                    {s.camera ? <Video size={18} /> : <VideoOff size={18} />}
                    <span>Camera {s.camera ? 'on' : 'off'}</span>
                  </button>
                  <button
                    className={`control-button ${!s.mic ? 'off' : ''}`}
                    disabled={s.mediaBusy}
                    onClick={() => void booth.microphone()}
                  >
                    {s.mic ? <Mic size={18} /> : <MicOff size={18} />}
                    <span>Mic {s.mic ? 'on' : 'off'}</span>
                  </button>
                </div>
                {s.devices.length > 1 && (
                  <CameraSelect
                    devices={s.devices}
                    current={s.stream?.getVideoTracks()[0]?.getSettings().deviceId}
                    busy={s.mediaBusy || s.progress.busy}
                    change={(id) => void booth.openCamera(id)}
                  />
                )}
              </div>
              {s.member &&
                (s.status !== 'connected' || s.notice.startsWith('Copy is unavailable')) && (
                  <div className="invitation-card">
                    <div className="invitation-icon">
                      <Link2 size={21} />
                    </div>
                    <div>
                      <strong>
                        {s.status === 'waiting' || s.status === 'left'
                          ? 'Save the other seat for your person.'
                          : statusWords[s.status]}
                      </strong>
                      <p>
                        Keep this invitation private. This booth is for two and expires after two
                        hours.
                      </p>
                      <input
                        className="invite-link"
                        aria-label="Private invitation link"
                        readOnly
                        value={booth.invitation}
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                  </div>
                )}
              <div className="capture-dock">
                <div className="readiness">
                  <span className={s.ready ? 'is-ready' : ''}>
                    <i />
                    {s.ready ? 'You’re ready' : 'Get comfortable'}
                  </span>
                  <span className={s.partnerReady ? 'is-ready' : ''}>
                    <i />
                    {s.partnerReady ? 'Your person is ready' : 'Waiting for your person'}
                  </span>
                </div>
                <div className="capture-actions">
                  <button
                    className={`button ${s.ready ? 'ready-button' : 'secondary'}`}
                    disabled={s.status !== 'connected' || !s.camera || s.progress.busy}
                    onClick={() => booth.ready()}
                  >
                    {s.ready ? <Check size={17} /> : <Heart size={17} />}{' '}
                    {s.ready ? 'I’m ready' : 'Ready when you are'}
                  </button>
                  {host ? (
                    <button
                      className="button primary capture-button"
                      disabled={
                        !canCapture(true, s.ready, s.partnerReady, s.progress.busy, s.clockReady) ||
                        s.status !== 'connected'
                      }
                      onClick={() => booth.captureNow()}
                    >
                      <Camera size={20} />
                      {s.progress.busy ? 'Making a memory…' : 'Take our photos'}
                    </button>
                  ) : (
                    <p className="small muted">
                      {s.member
                        ? 'Your host starts the countdown when you’re both ready.'
                        : 'Open a new booth to meet again.'}
                    </p>
                  )}
                </div>
                {s.progress.busy ? (
                  <div className="capture-progress" role="status" aria-live="polite">
                    <span>
                      {s.progress.phase}
                      {s.progress.percent > 0 && ` · ${s.progress.percent}%`}
                    </span>
                    <button className="text-button" onClick={() => booth.cancel()}>
                      <X size={13} /> Cancel
                    </button>
                  </div>
                ) : (
                  <p className="capture-hint">
                    3 poses · a shared countdown · one strip for both of you
                  </p>
                )}
              </div>
              <p className="timing-note">
                Keep both tabs visible during capture. We coordinate the countdown, but network and
                camera delays can cause small timing differences.
                {host && s.clockReady
                  ? ` Estimated network timing uncertainty: ±${Math.ceil(s.uncertainty)} ms.`
                  : ''}
              </p>
            </div>
            <aside className="frame-sidebar">
              <FramePicker
                settings={s.settings}
                disabled={!host || s.progress.busy || !s.member}
                onChange={(v) => booth.settings(v)}
              />
              <div className="sidebar-note">
                <Heart size={16} /> Good photos start with a good laugh.
              </div>
            </aside>
          </div>
        </main>
      )}
      {s.stage === 'result' && s.result && (
        <Results
          blob={s.result}
          retake={() => booth.discard()}
          startOver={() => {
            booth.leave();
            booth.setup('create');
          }}
          error={s.error}
        />
      )}
      <footer className="site-footer content-width">
        <span>A little closer, wherever you are.</span>
        <span>
          Made for two <Heart size={12} />
        </span>
      </footer>
      {joinOpen && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setJoinOpen(false);
          }}
        >
          <section
            className="join-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setJoinOpen(false);
            }}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close join dialog"
              onClick={() => setJoinOpen(false)}
            >
              <X size={20} />
            </button>
            <div className="empty-icon">
              <Link2 size={24} />
            </div>
            <h2 id="join-title">Someone saved you a seat.</h2>
            <p>Paste the private invitation link your person sent you.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                join();
              }}
            >
              <label>
                Invitation link
                <input
                  autoFocus
                  value={joinLink}
                  onChange={(e) => setJoinLink(e.target.value)}
                  placeholder="https://…/#room=…"
                  required
                />
              </label>
              {joinError && (
                <p role="alert" className="error-text">
                  {joinError}
                </p>
              )}
              <button className="button primary w-full" type="submit">
                Join a Booth <ArrowRight size={17} />
              </button>
            </form>
            <p className="privacy-note">You’ll preview your camera before asking to join.</p>
          </section>
        </div>
      )}
      {demoOpen && <DemoVideo onClose={() => setDemoOpen(false)} />}
    </div>
  );
}
function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
    </svg>
  );
}
function CameraSelect({
  devices,
  current,
  busy,
  change,
}: {
  devices: MediaDeviceInfo[];
  current?: string;
  busy: boolean;
  change: (id: string) => void;
}) {
  return (
    <label className="camera-select">
      <span className="sr-only">Select camera</span>
      <select
        aria-label="Select camera"
        disabled={busy}
        value={current ?? ''}
        onChange={(e) => change(e.target.value)}
      >
        {devices.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Camera ${i + 1}`}
          </option>
        ))}
      </select>
      <ChevronDown size={14} />
    </label>
  );
}
function Feedback({ error, notice, clear }: { error: string; notice: string; clear: () => void }) {
  if (!error && !notice) return null;
  return (
    <div className={error ? 'error-banner' : 'notice-banner'} role={error ? 'alert' : 'status'}>
      <span>{error || notice}</span>
      <button aria-label="Dismiss message" onClick={clear}>
        <X size={16} />
      </button>
    </div>
  );
}
export default App;
