import React, { useState } from 'react';

const STICKER_PACKS: { name: string; stickers: string[] }[] = [
  {
    name: 'Smileys',
    stickers: [
      '😀', '😂', '🥹', '😍', '🥰', '😎', '🤩', '🥳',
      '😭', '😤', '🤯', '🫡', '🤗', '🫠', '😈', '💀',
      '🙈', '🙉', '🙊', '🤡', '👻', '👽', '🤖', '💩',
    ],
  },
  {
    name: 'Gestures',
    stickers: [
      '👍', '👎', '👏', '🙌', '🤝', '✌️', '🤞', '🤟',
      '🫶', '💪', '🫰', '👊', '🖐️', '👋', '🤙', '🫵',
      '☝️', '👆', '👇', '👈', '👉', '🤌', '🫳', '🫴',
    ],
  },
  {
    name: 'Hearts',
    stickers: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
      '💕', '💞', '💓', '💗', '💖', '💘', '💝', '❤️‍🔥',
      '💋', '🫀', '❤️‍🩹', '💔', '♥️', '🩷', '🩵', '🩶',
    ],
  },
  {
    name: 'Fun',
    stickers: [
      '🎉', '🎊', '🔥', '⚡', '✨', '💫', '🌈', '🦄',
      '🍕', '🍔', '🌮', '🍩', '☕', '🍺', '🎸', '🎮',
      '🚀', '🛸', '💎', '🏆', '🎯', '🪄', '🧸', '🎪',
    ],
  },
];

interface Props {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export const StickerPicker: React.FC<Props> = ({ onSelect, onClose }) => {
  const [activePack, setActivePack] = useState(0);

  return (
    <div className="media-picker-panel">
      <div className="media-picker-header">
        <span className="media-picker-title">Stickers</span>
        <button className="media-picker-close" onClick={onClose}>×</button>
      </div>
      <div className="sticker-pack-tabs">
        {STICKER_PACKS.map((pack, i) => (
          <button
            key={pack.name}
            className={`sticker-tab ${i === activePack ? 'active' : ''}`}
            onClick={() => setActivePack(i)}
          >
            {pack.stickers[0]} {pack.name}
          </button>
        ))}
      </div>
      <div className="media-picker-grid sticker-grid">
        {STICKER_PACKS[activePack].stickers.map((emoji, i) => (
          <button
            key={i}
            className="sticker-item"
            onClick={() => onSelect(emoji)}
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
};
