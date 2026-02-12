import React, { useRef, useState } from 'react';
import { compressImage } from '../../hooks/useMediaUpload';

// Default avatar options — colorful gradient circles with icons
const DEFAULT_AVATARS = [
  { id: 'default-1', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', emoji: '😎' },
  { id: 'default-2', gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', emoji: '🌸' },
  { id: 'default-3', gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', emoji: '🌊' },
  { id: 'default-4', gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', emoji: '🌿' },
  { id: 'default-5', gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', emoji: '🔥' },
  { id: 'default-6', gradient: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)', emoji: '✨' },
  { id: 'default-7', gradient: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', emoji: '🧡' },
  { id: 'default-8', gradient: 'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)', emoji: '💎' },
  { id: 'default-9', gradient: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', emoji: '🌺' },
  { id: 'default-10', gradient: 'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)', emoji: '🦋' },
  { id: 'default-11', gradient: 'linear-gradient(135deg, #fdcb6e 0%, #e17055 100%)', emoji: '🌅' },
  { id: 'default-12', gradient: 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)', emoji: '🚀' },
];

interface Props {
  currentPhotoURL: string | null;
  displayName: string;
  onSelect: (photoURL: string | null) => Promise<void>;
  onClose: () => void;
}

export const AvatarPicker: React.FC<Props> = ({ currentPhotoURL, displayName, onSelect, onClose }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string | null>(currentPhotoURL);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    try {
      const dataUrl = await compressImage(file, 256);
      setSelected(dataUrl);
      await onSelect(dataUrl);
    } catch {
      /* ignore */
    }
    setUploading(false);
  };

  const handleDefaultSelect = async (avatar: typeof DEFAULT_AVATARS[0]) => {
    // Generate a small SVG data URL for the default avatar
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
      <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${extractColors(avatar.gradient)[0]}"/>
        <stop offset="100%" style="stop-color:${extractColors(avatar.gradient)[1]}"/>
      </linearGradient></defs>
      <circle cx="128" cy="128" r="128" fill="url(#g)"/>
      <text x="128" y="148" text-anchor="middle" font-size="100">${avatar.emoji}</text>
    </svg>`;
    const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    setSelected(dataUrl);
    await onSelect(dataUrl);
  };

  const handleRemove = async () => {
    setSelected(null);
    await onSelect(null);
  };

  const isCustomPhoto = selected && !selected.startsWith('data:image/svg+xml');

  return (
    <div className="modal-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Profile Picture</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ padding: '20px 24px' }}>
          {/* Current avatar preview */}
          <div className="avatar-preview-wrapper">
            {selected ? (
              <img src={selected} alt="Avatar" className="avatar-preview-img" />
            ) : (
              <div className="avatar-preview-initials">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Upload custom photo */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
            <button
              className="avatar-action-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              📷 {uploading ? 'Uploading...' : 'Upload Photo'}
            </button>
            {selected && (
              <button className="avatar-action-btn remove" onClick={handleRemove}>
                🗑️ Remove
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />

          {/* Default avatars grid */}
          <p style={{ color: '#8696A0', fontSize: '0.85rem', marginBottom: 12 }}>Or choose a default:</p>
          <div className="default-avatars-grid">
            {DEFAULT_AVATARS.map((avatar) => (
              <button
                key={avatar.id}
                className="default-avatar-btn"
                style={{ background: avatar.gradient }}
                onClick={() => handleDefaultSelect(avatar)}
                title={avatar.emoji}
              >
                <span style={{ fontSize: '1.6rem' }}>{avatar.emoji}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

function extractColors(gradient: string): [string, string] {
  const matches = gradient.match(/#[0-9a-fA-F]{6}/g);
  if (matches && matches.length >= 2) return [matches[0], matches[1]];
  return ['#667eea', '#764ba2'];
}
