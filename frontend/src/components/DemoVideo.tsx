import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export function DemoVideo({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    void dialog
      ?.querySelector('video')
      ?.play()
      .catch(() => {
        // Native controls remain available when autoplay is unavailable.
      });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.querySelector('video')?.pause();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="demo-modal"
      aria-labelledby="demo-title"
      aria-describedby="demo-description"
      onClose={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          event.currentTarget.close();
      }}
    >
      <div className="demo-heading">
        <div>
          <span className="section-eyebrow">A LITTLE LOOK INSIDE</span>
          <h2 id="demo-title">See a memory come together.</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close demo"
          onClick={() => dialogRef.current?.close()}
          autoFocus
        >
          <X size={21} />
        </button>
      </div>
      <p id="demo-description">
        A narrated walkthrough with illustrated demo cameras. English voiceover, no music.
      </p>
      <video
        className="demo-video"
        controls
        autoPlay
        playsInline
        preload="metadata"
        poster="/demo/twogether-demo-poster.jpg"
        aria-label="TwoGether Booth narrated demo: create, invite, pose, and download"
        onError={() => setFailed(true)}
      >
        <source src="/demo/twogether-demo.mp4" type="video/mp4" />
        <track kind="captions" src="/demo/twogether-demo.en.vtt" srcLang="en" label="English" />
        Your browser does not support video playback.
      </video>
      {failed && (
        <p role="alert">The demo could not load. Try reopening it or download it below.</p>
      )}
      <div className="demo-footer">
        <details>
          <summary>Read the walkthrough</summary>
          <ol>
            <li>Create a booth, enter your name, and enable your camera.</li>
            <li>Send your private invitation link to your person. Approve their request.</li>
            <li>Pick a frame and add your names and a caption.</li>
            <li>Both tap Ready. The host starts the three-pose countdown.</li>
            <li>Both receive the same photo strip. Download the PNG to keep it.</li>
          </ol>
        </details>
        <a href="/demo/twogether-demo.mp4" download="twogether-booth-demo.mp4">
          Download demo
        </a>
      </div>
    </dialog>
  );
}
