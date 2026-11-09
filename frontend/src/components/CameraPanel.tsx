import { useEffect, useRef, useState } from 'react';
import { Camera, Heart, VideoOff, Volume2, VolumeX } from 'lucide-react';
type Props = {
  stream: MediaStream | null;
  local?: boolean;
  name: string;
  enabled: boolean;
  ready?: boolean;
  status?: string;
  onVideo?: (v: HTMLVideoElement | null) => void;
  count?: number | null;
  pose?: number;
};
export function CameraPanel({
  stream,
  local = false,
  name,
  enabled,
  ready = false,
  status,
  onVideo,
  count,
  pose,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [hear, setHear] = useState(false),
    [paused, setPaused] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    onVideo?.(video);
    if (stream)
      void video
        .play()
        .then(() => setPaused(false))
        .catch(() => setPaused(true));
    return () => {
      video.srcObject = null;
      onVideo?.(null);
    };
  }, [stream, onVideo]);
  return (
    <div className={`camera-panel ${local ? 'local' : 'partner'}`}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={local || !hear}
        className={local ? 'mirror' : ''}
        aria-label={`${name} live camera`}
      />
      {(!stream || !enabled) && (
        <div className="camera-empty">
          <div className="empty-icon">
            {!enabled && stream ? (
              <VideoOff size={25} />
            ) : local ? (
              <Camera size={25} />
            ) : (
              <Heart size={25} />
            )}
          </div>
          <strong>
            {stream ? 'Camera is off' : local ? 'A little camera check' : 'A place for your person'}
          </strong>
          <span>
            {stream
              ? 'Turn it on when you’re ready.'
              : local
                ? 'Your preview will appear here.'
                : status || 'Invite them to share this moment.'}
          </span>
        </div>
      )}
      {stream && enabled && (
        <>
          <span className="camera-live">
            <span /> LIVE
          </span>
          <div className="camera-name">
            {name}
            {local && ' (you)'}
            {ready && <span className="ready-tag">Ready</span>}
          </div>
        </>
      )}
      {!local && stream && (
        <button
          className="audio-button"
          onClick={() => {
            setHear(!hear);
            if (ref.current) {
              ref.current.muted = hear;
              void ref.current.play().catch(() => setPaused(true));
            }
          }}
        >
          {hear ? <Volume2 size={15} /> : <VolumeX size={15} />}{' '}
          {hear ? 'Sound on' : 'Hear partner'}
        </button>
      )}
      {paused && stream && enabled && (
        <button
          className="play-video"
          onClick={() => {
            void ref.current?.play().then(() => setPaused(false));
          }}
        >
          Tap to play video
        </button>
      )}
      {count != null && (
        <div className="countdown">
          <span>POSE {pose} OF 3</span>
          <strong key={`${pose}-${count}`}>{count}</strong>
        </div>
      )}
    </div>
  );
}
