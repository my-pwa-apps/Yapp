import React, { useState, useRef } from 'react';
import { compressImage, blobToDataURL } from '../../hooks/useMediaUpload';
import { GifPicker } from '../Chat/GifPicker';
import { StickerPicker } from '../Chat/StickerPicker';
import { VoiceRecorder } from '../Chat/VoiceRecorder';
import { checkContent } from '../../utils/contentFilter';

interface Props {
  onPost: (text: string, mediaURL?: string, mediaType?: 'image' | 'gif' | 'sticker' | 'voice', voiceDuration?: number, privacy?: 'public' | 'contacts') => Promise<void>;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  onCancel?: () => void;
  /** Hide privacy selector (e.g. in reply composer) */
  hidePrivacy?: boolean;
}

export const YappComposer: React.FC<Props> = ({ onPost, placeholder, autoFocus, compact, onCancel, hidePrivacy }) => {
  const [text, setText] = useState('');
  const [mediaURL, setMediaURL] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'gif' | 'sticker' | 'voice' | null>(null);
  const [sending, setSending] = useState(false);
  const [contentWarning, setContentWarning] = useState('');
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [voiceDuration, setVoiceDuration] = useState<number | undefined>(undefined);
  const [privacy, setPrivacy] = useState<'public' | 'contacts'>(() => {
    return (localStorage.getItem('yapp-default-privacy') as 'public' | 'contacts') || 'public';
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const charLimit = 500;
  const remaining = charLimit - text.length;

  const togglePrivacy = () => {
    const next = privacy === 'public' ? 'contacts' : 'public';
    setPrivacy(next);
    localStorage.setItem('yapp-default-privacy', next);
  };

  const handlePost = async () => {
    const trimmed = text.trim();
    if (!trimmed && !mediaURL) return;
    setContentWarning('');
    setSending(true);
    try {
      // Content moderation check
      if (trimmed) {
        const result = await checkContent(trimmed);
        if (!result.clean) {
          setContentWarning('Your post contains inappropriate language. Please revise it before posting.');
          setSending(false);
          return;
        }
      }
      await onPost(trimmed, mediaURL ?? undefined, mediaType ?? undefined, voiceDuration, privacy);
      setText('');
      setMediaURL(null);
      setMediaType(null);
      setVoiceDuration(undefined);
    } catch (e) {
      console.error('[YappComposer] Post failed:', e);
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

  const handleStickerSelect = async (emoji: string) => {
    setShowStickerPicker(false);
    // Content moderation check for sticker text
    const result = await checkContent(emoji);
    if (!result.clean) {
      setContentWarning(result.flaggedWords.length > 0 ? `Flagged: ${result.flaggedWords.join(', ')}` : 'This sticker was flagged by our content filter.');
      return;
    }
    setSending(true);
    try {
      await onPost(emoji, emoji, 'sticker', undefined, privacy);
      setText('');
      setMediaURL(null);
      setMediaType(null);
    } catch (e) {
      console.error('[YappComposer] Sticker post failed:', e);
    } finally {
      setSending(false);
    }
  };

  const handleVoiceSend = async (blob: Blob, duration: number) => {
    setShowVoiceRecorder(false);
    setSending(true);
    try {
      const dataUrl = await blobToDataURL(blob);
      setMediaURL(dataUrl);
      setMediaType('voice');
      setVoiceDuration(duration);
      // Auto-post voice message
      await onPost('🎤 Voice message', dataUrl, 'voice', duration, privacy);
      setText('');
      setMediaURL(null);
      setMediaType(null);
      setVoiceDuration(undefined);
    } catch (e) {
      console.error('[YappComposer] Voice post failed:', e);
    } finally {
      setSending(false);
    }
  };

  if (showVoiceRecorder) {
    return (
      <div className={`yapp-composer ${compact ? 'yapp-composer-compact' : ''}`}>
        <VoiceRecorder
          onSend={handleVoiceSend}
          onCancel={() => setShowVoiceRecorder(false)}
        />
      </div>
    );
  }

  return (
    <div className={`yapp-composer ${compact ? 'yapp-composer-compact' : ''}`}>
      <textarea
        className="yapp-composer-input"
        placeholder={placeholder || "What's on your mind? Start yappin'..."}
        value={text}
        onChange={(e) => { setText(e.target.value.slice(0, charLimit)); setContentWarning(''); }}
        onKeyDown={handleKeyDown}
        autoFocus={autoFocus}
        rows={compact ? 2 : 3}
      />
      {contentWarning && (
        <div className="yapp-content-warning">{contentWarning}</div>
      )}
      {mediaURL && (
        <div className="yapp-composer-media-preview">
          <img src={mediaURL} alt="attachment" />
          <button className="yapp-composer-media-remove" onClick={() => { setMediaURL(null); setMediaType(null); }} title="Remove attachment" aria-label="Remove attachment">
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
          <button className="icon-btn" title="Add GIF" onClick={() => { setShowGifPicker(!showGifPicker); setShowStickerPicker(false); }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M11.5 9H13v6h-1.5zM9 9H6c-.6 0-1 .5-1 1v4c0 .5.4 1 1 1h3c.6 0 1-.5 1-1v-2H8.5v1.5h-2v-3H10V10c0-.5-.4-1-1-1zm10 1.5V9h-4.5v6H16v-2h2v-1.5h-2v-1z"/>
            </svg>
          </button>
          <button className="icon-btn" title="Stickers" onClick={() => { setShowStickerPicker(!showStickerPicker); setShowGifPicker(false); }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
            </svg>
          </button>
          <button className="icon-btn" title="Voice message" onClick={() => setShowVoiceRecorder(true)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
            </svg>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleImagePick} />
          {!hidePrivacy && (
            <button
              className={`icon-btn yapp-privacy-toggle ${privacy === 'contacts' ? 'yapp-privacy-contacts' : ''}`}
              title={privacy === 'public' ? 'Public — visible to everyone' : 'Contacts only'}
              aria-label={privacy === 'public' ? 'Visibility: public' : 'Visibility: contacts only'}
              onClick={togglePrivacy}
              type="button"
            >
              {privacy === 'public' ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
              )}
            </button>
          )}
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
      {showStickerPicker && (
        <div className="yapp-gif-picker-wrap">
          <StickerPicker onSelect={handleStickerSelect} onClose={() => setShowStickerPicker(false)} />
        </div>
      )}
    </div>
  );
};
