import { useEffect, useRef } from 'react';

/**
 * Document-level key bindings, so a session is playable without the mouse no
 * matter where focus happens to be.
 *
 * Three things it deliberately does not do:
 *
 *  - fire while the user is typing in a field, which would make the config
 *    screen unusable;
 *  - fire for a shortcut combined with a modifier, which belongs to the browser
 *    or the OS;
 *  - fire when a button has focus, because the browser already turns Enter and
 *    Space into a click there and handling it again would skip a hand.
 */
export function useKeyboardShortcuts(
  handlers: Record<string, () => void>,
  enabled: boolean
): void {
  // Kept in a ref so a new handler object each render does not rebind.
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable) return;
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (tag === 'BUTTON' && (event.key === 'Enter' || event.key === ' ')) {
          return;
        }
      }

      const handler = latest.current[event.key.toLowerCase()];
      if (!handler) return;
      event.preventDefault();
      handler();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
