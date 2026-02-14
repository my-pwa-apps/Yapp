/**
 * Shared formatting utilities.
 */

/** Format seconds as m:ss */
export function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Format a "last seen" relative time string */
export function formatLastSeen(lastSeen: number): string {
  const diff = Date.now() - lastSeen;
  if (diff < 60_000) return 'seen just now';
  if (diff < 3_600_000) return `seen ${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `seen ${Math.floor(diff / 3_600_000)}h ago`;
  return `seen ${new Date(lastSeen).toLocaleDateString()}`;
}

/** Format a timestamp as a short relative time (1m, 2h, 3d, etc.) */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
