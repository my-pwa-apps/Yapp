/**
 * Tiny history-based navigation stack.
 *
 * Yapp has no router library. This hook wraps `history.pushState` /
 * `popstate` so views that push onto a navigation stack (e.g. feed threads,
 * profiles, mobile chat drill-down) integrate with the browser/Android
 * hardware Back button instead of exiting the PWA.
 *
 * Usage:
 *   const { push, pop, stack, active } = useHistoryStack<Yapp>('thread');
 *   push(yapp);        // adds to stack + history
 *   // When user presses Back, pop() fires and active flips back.
 *
 * The key is a stable string used as the history state type tag so multiple
 * instances on the same page don't interfere (e.g. 'thread' vs 'profile').
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface HistoryEntry<T> {
  yappKey: string;
  id: string;
  value: T;
}

let idCounter = 0;
function nextId(): string {
  idCounter = (idCounter + 1) % 0xffffffff;
  return `h${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function useHistoryStack<T>(key: string, maxDepth = 20) {
  const [stack, setStack] = useState<T[]>([]);
  const idsRef = useRef<string[]>([]);

  const push = useCallback(
    (value: T) => {
      const id = nextId();
      idsRef.current.push(id);
      setStack((prev) => {
        const next = [...prev, value];
        return next.length > maxDepth ? next.slice(next.length - maxDepth) : next;
      });
      const entry: HistoryEntry<T> = { yappKey: key, id, value };
      try {
        window.history.pushState(entry, '');
      } catch {
        /* pushState may fail in sandboxed iframes */
      }
    },
    [key, maxDepth],
  );

  const pop = useCallback(() => {
    setStack((prev) => (prev.length <= 1 ? [] : prev.slice(0, -1)));
    idsRef.current.pop();
    // Only go back if the current history state actually belongs to us
    if ((window.history.state as HistoryEntry<T> | null)?.yappKey === key) {
      try { window.history.back(); } catch { /* noop */ }
    }
  }, [key]);

  const clear = useCallback(() => {
    // Pop all of our entries off the history
    const count = idsRef.current.length;
    idsRef.current = [];
    setStack([]);
    for (let i = 0; i < count; i++) {
      if ((window.history.state as HistoryEntry<T> | null)?.yappKey === key) {
        try { window.history.back(); } catch { /* noop */ }
      }
    }
  }, [key]);

  // Listen for browser/hardware Back button
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const state = e.state as HistoryEntry<T> | null;
      // If we're popping back through one of our entries, trim the stack accordingly
      const ownedIndex = state && state.yappKey === key ? idsRef.current.indexOf(state.id) : -1;
      if (ownedIndex === -1) {
        // Popped all the way past our entries — clear stack
        idsRef.current = [];
        setStack([]);
      } else {
        idsRef.current = idsRef.current.slice(0, ownedIndex + 1);
        setStack((prev) => prev.slice(0, ownedIndex + 1));
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [key]);

  return { stack, active: stack[stack.length - 1] ?? null, push, pop, clear };
}
