import { useEffect, useRef } from 'react';

/**
 * Moves focus to an element once it appears. Used so keyboard users land on the
 * feedback's primary action instead of having to tab back to it.
 */
export function useAutoFocus<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (active) ref.current?.focus();
  }, [active]);
  return ref;
}
