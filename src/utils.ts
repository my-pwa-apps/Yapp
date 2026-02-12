/**
 * Shared formatting utilities.
 */

/** Format a "last seen" relative time string */
export function formatLastSeen(lastSeen: number): string {
  const diff = Date.now() - lastSeen;
  if (diff < 60_000) return 'seen just now';
  if (diff < 3_600_000) return `seen ${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `seen ${Math.floor(diff / 3_600_000)}h ago`;
  return `seen ${new Date(lastSeen).toLocaleDateString()}`;
}
