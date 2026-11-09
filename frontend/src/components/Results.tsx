import { useEffect, useState } from 'react';
import { Download, Share2, RotateCcw, Trash2, ArrowUpRight, Heart } from 'lucide-react';
export function Results({
  blob,
  retake,
  startOver,
  error,
}: {
  blob: Blob;
  retake: () => void;
  startOver: () => void;
  error: string;
}) {
  const [url, setUrl] = useState(''),
    [notice, setNotice] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  const download = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'twogether-memory.png';
    a.click();
    setNotice('Download requested. Find your strip in your browser’s downloads.');
  };
  const share = async () => {
    const file = new File([blob], 'twogether-memory.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Our little memory' });
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          download();
          setNotice('Image sharing is unavailable here, so your PNG was downloaded.');
        }
      }
    } else {
      download();
      setNotice('Image sharing is unavailable here, so your PNG was downloaded.');
    }
  };
  return (
    <main className="results-page content-width">
      <div className="result-art">
        {url && (
          <img
            src={url}
            alt="Your shared photo strip: three poses, with both partners beside each other in each row"
          />
        )}
        <span className="result-note">
          a little closer, always <Heart size={17} />
        </span>
      </div>
      <div className="result-copy">
        <span className="section-eyebrow">A MEMORY, MADE TOGETHER</span>
        <h1>
          One for you.
          <br />
          <em>One for them.</em>
        </h1>
        <p>
          The same little strip, on both sides of the distance. Keep this one somewhere special.
        </p>
        <div className="result-actions">
          <button className="button primary" onClick={download} disabled={!url}>
            <Download size={18} /> Download PNG
          </button>
          <button className="button secondary" onClick={() => void share()} disabled={!url}>
            <Share2 size={18} /> Share image
          </button>
        </div>
        <p className="privacy-note">
          Your photos stay temporary in this booth. Download or share to keep them; they aren’t
          automatically saved to your gallery.
        </p>
        {(notice || error) && (
          <p className={error ? 'error-banner' : 'notice-banner'} role="status">
            {error || notice}
          </p>
        )}
        <div className="result-other">
          <button className="text-button" onClick={retake}>
            <RotateCcw size={16} /> Retake strip
          </button>
          <button className="text-button" onClick={retake}>
            <Trash2 size={16} /> Discard photos
          </button>
          <button className="text-button" onClick={startOver}>
            Start another booth <ArrowUpRight size={16} />
          </button>
        </div>
        <p className="small muted">
          Retaking discards the current photos from both open booth pages. Download first if you’d
          like to keep them.
        </p>
      </div>
    </main>
  );
}
