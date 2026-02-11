import React, { useState, useEffect, useRef, useCallback } from 'react';

// GIPHY public beta key (rate-limited, for development)
const GIPHY_KEY = 'GlVGYHkr3WSBnllca54iNt0yFbjz7L65';
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

interface GifResult {
  id: string;
  title: string;
  images: {
    fixed_height: { url: string; width: string; height: string };
    fixed_height_still: { url: string };
    original: { url: string };
  };
}

interface Props {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

export const GifPicker: React.FC<Props> = ({ onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchGifs = useCallback(async (searchQuery: string) => {
    setLoading(true);
    try {
      const endpoint = searchQuery.trim()
        ? `${GIPHY_BASE}/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(searchQuery)}&limit=30&rating=pg`
        : `${GIPHY_BASE}/trending?api_key=${GIPHY_KEY}&limit=30&rating=pg`;
      const res = await fetch(endpoint);
      const json = await res.json();
      setGifs(json.data || []);
    } catch {
      setGifs([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGifs('');
  }, [fetchGifs]);

  const handleSearch = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchGifs(val), 400);
  };

  return (
    <div className="media-picker-panel">
      <div className="media-picker-header">
        <input
          className="media-picker-search"
          placeholder="Search GIFs..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          autoFocus
        />
        <button className="media-picker-close" onClick={onClose}>×</button>
      </div>
      <div className="media-picker-grid gif-grid">
        {loading && <div className="media-picker-loading">Loading...</div>}
        {!loading && gifs.length === 0 && (
          <div className="media-picker-empty">No GIFs found</div>
        )}
        {gifs.map((gif) => (
          <button
            key={gif.id}
            className="gif-item"
            onClick={() => onSelect(gif.images.fixed_height.url)}
            title={gif.title}
          >
            <img
              src={gif.images.fixed_height_still.url}
              alt={gif.title}
              loading="lazy"
              onMouseEnter={(e) => {
                (e.target as HTMLImageElement).src = gif.images.fixed_height.url;
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLImageElement).src = gif.images.fixed_height_still.url;
              }}
            />
          </button>
        ))}
      </div>
      <div className="media-picker-footer">
        <span className="giphy-attribution">Powered by GIPHY</span>
      </div>
    </div>
  );
};
