import { Check, Heart } from 'lucide-react';
import type { StripSettings } from '@twogether/protocol';
export const frames = [
  { id: 'cream', name: 'Classic cream', detail: 'Timeless & a little nostalgic' },
  { id: 'rose', name: 'Rose scrapbook', detail: 'A soft spot for your person' },
  { id: 'mono', name: 'Black & white', detail: 'Your very own movie moment' },
] as const;
export function MiniStrip({
  frame = 'cream',
  portraits = false,
}: {
  frame?: StripSettings['frame'];
  portraits?: boolean;
}) {
  return (
    <div className={`mini-strip ${frame} ${portraits ? 'with-portraits' : ''}`} aria-hidden="true">
      <div className="strip-tiny-title">better together</div>
      {[0, 1, 2].map((i) => (
        <div className={`mini-row pose-${i}`} key={i}>
          <div>{portraits && <i className="portrait p-one" />}</div>
          <div>{portraits && <i className="portrait p-two" />}</div>
        </div>
      ))}
      <div className="strip-tiny-heart">
        <Heart size={portraits ? 15 : 6} fill="currentColor" />
      </div>
      <div className="strip-tiny-brand">TWOGETHER BOOTH</div>
    </div>
  );
}
export function FramePicker({
  settings,
  onChange,
  disabled,
}: {
  settings: StripSettings;
  onChange: (s: StripSettings) => void;
  disabled: boolean;
}) {
  return (
    <div className="frame-picker">
      <div className="section-eyebrow">MAKE IT YOURS</div>
      <h2>A frame for this feeling.</h2>
      <p className="small muted">
        {disabled
          ? 'Your host sets the frame and details.'
          : 'Choose the little details. Both of you get the same strip.'}
      </p>
      <fieldset disabled={disabled}>
        <legend className="sr-only">Photo strip frame</legend>
        <div className="frame-options">
          {frames.map((f) => (
            <button
              className={`frame-option ${settings.frame === f.id ? 'selected' : ''}`}
              key={f.id}
              aria-pressed={settings.frame === f.id}
              onClick={() => onChange({ ...settings, frame: f.id })}
            >
              <MiniStrip frame={f.id} />
              <span>
                <strong>{f.name}</strong>
                <small>{f.detail}</small>
              </span>
              {settings.frame === f.id && <Check size={16} />}
            </button>
          ))}
        </div>
        <label>
          Your names <span>(optional)</span>
          <input
            maxLength={60}
            placeholder="You & your person"
            value={settings.names}
            onChange={(e) => onChange({ ...settings, names: e.target.value })}
          />
        </label>
        <label>
          A little caption <span>(optional)</span>
          <input
            maxLength={80}
            placeholder="Closer, for a moment."
            value={settings.caption}
            onChange={(e) => onChange({ ...settings, caption: e.target.value })}
          />
        </label>
        <label>
          Your date{' '}
          <input
            type="date"
            value={settings.date}
            onChange={(e) => onChange({ ...settings, date: e.target.value })}
          />
        </label>
      </fieldset>
    </div>
  );
}
