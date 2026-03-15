import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PUSH_WORKER_URL } from '../../pushConfig';

const GIPHY_PROXY = PUSH_WORKER_URL ? `${PUSH_WORKER_URL}/giphy` : '';

interface GifResult {
  id: string;
  title: string;
  images: {
    fixed_height: { url: string; width: string; height: string };
    fixed_height_still: { url: string };
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
    if (!GIPHY_PROXY) { setGifs([]); return; }
    setLoading(true);
    try {
      const params = searchQuery.trim()
        ? `?q=${encodeURIComponent(searchQuery)}&limit=30`
        : '?limit=30';
      const res = await fetch(`${GIPHY_PROXY}${params}`);
      const json = await res.json();
      setGifs(json.data || []);
    } catch {
      setGifs([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGifs('');
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
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
