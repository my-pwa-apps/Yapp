import { useEffect, useRef } from 'react';

/**
 * Manages focus trap and Escape key handling for modal dialogs.
 * Traps Tab/Shift+Tab within the modal and closes on Escape.
 */
export function useModalA11y(onClose: () => void) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusable = el.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    el.addEventListener('keydown', handleKeyDown);

    // Focus first focusable element on mount
    const firstFocusable = el.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();

    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return modalRef;
}
