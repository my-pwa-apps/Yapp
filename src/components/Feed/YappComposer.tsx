import React, { useState, useRef } from 'react';
import { compressImage } from '../../hooks/useMediaUpload';
import { GifPicker } from '../Chat/GifPicker';

interface Props {
  onPost: (text: string, mediaURL?: string, mediaType?: 'image' | 'gif') => Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  onCancel?: () => void;
}

export const YappComposer: React.FC<Props> = ({ onPost, placeholder, autoFocus, compact, onCancel }) => {
  const [text, setText] = useState('');
  const [mediaURL, setMediaURL] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'gif' | null>(null);
  const [sending, setSending] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const charLimit = 500;
  const remaining = charLimit - text.length;

  const handlePost = async () => {
    const trimmed = text.trim();
    if (!trimmed && !mediaURL) return;
    setSending(true);
    try {
      await onPost(trimmed, mediaURL ?? undefined, mediaType ?? undefined);
      setText('');
      setMediaURL(null);
      setMediaType(null);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handlePost();
    }
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataURL = await compressImage(file, 1200);
    setMediaURL(dataURL);
    setMediaType('image');
    e.target.value = '';
  };

  const handleGifSelect = (url: string) => {
    setMediaURL(url);
    setMediaType('gif');
    setShowGifPicker(false);
  };

  return (
    <div className={`yapp-composer ${compact ? 'yapp-composer-compact' : ''}`}>
      <textarea
        className="yapp-composer-input"
        placeholder={placeholder || "What's on your mind? Start yappin'..."}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, charLimit))}
        onKeyDown={handleKeyDown}
        autoFocus={autoFocus}
        rows={compact ? 2 : 3}
      />
      {mediaURL && (
        <div className="yapp-composer-media-preview">
          <img src={mediaURL} alt="attachment" />
          <button className="yapp-composer-media-remove" onClick={() => { setMediaURL(null); setMediaType(null); }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      )}
      <div className="yapp-composer-footer">
        <div className="yapp-composer-actions">
          <button className="icon-btn" title="Add image" onClick={() => fileRef.current?.click()}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
          </button>
          <button className="icon-btn" title="Add GIF" onClick={() => setShowGifPicker(!showGifPicker)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M11.5 9H13v6h-1.5zM9 9H6c-.6 0-1 .5-1 1v4c0 .5.4 1 1 1h3c.6 0 1-.5 1-1v-2H8.5v1.5h-2v-3H10V10c0-.5-.4-1-1-1zm10 1.5V9h-4.5v6H16v-2h2v-1.5h-2v-1z"/>
            </svg>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleImagePick} />
        </div>
        <div className="yapp-composer-right">
          <span className={`yapp-char-count ${remaining < 50 ? 'warn' : ''} ${remaining < 0 ? 'over' : ''}`}>
            {remaining}
          </span>
          {onCancel && (
            <button className="yapp-btn yapp-btn-secondary" onClick={onCancel} disabled={sending}>
              Cancel
            </button>
          )}
          <button
            className="yapp-btn yapp-btn-primary"
            onClick={handlePost}
            disabled={sending || (!text.trim() && !mediaURL) || remaining < 0}
          >
            {sending ? 'Posting...' : 'Yapp'}
          </button>
        </div>
      </div>
      {showGifPicker && (
        <div className="yapp-gif-picker-wrap">
          <GifPicker onSelect={handleGifSelect} onClose={() => setShowGifPicker(false)} />
        </div>
      )}
    </div>
  );
};
