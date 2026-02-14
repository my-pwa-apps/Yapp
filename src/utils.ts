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

/** Format a timestamp as HH:MM for message bubbles */
export function formatMessageTime(ts: number | undefined): string {
  if (ts == null) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Format a timestamp for chat list sidebar: time today, weekday this week, else short date */
export function formatChatListTime(ts: number | undefined): string {
  if (ts == null) return '';
  const date = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 86_400_000 && now.getDate() === date.getDate()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 86_400_000 * 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
