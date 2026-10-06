import { useSyncExternalStore } from 'react';

/** From this width the table uses the two-column desktop layout. */
const WIDE_QUERY = '(min-width: 900px)';

const subscribe = (onChange: () => void): (() => void) => {
  const media = window.matchMedia?.(WIDE_QUERY);
  if (!media) return () => undefined;
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

const isWideNow = (): boolean => window.matchMedia?.(WIDE_QUERY).matches ?? false;

/**
 * True on a desktop-width window. The desktop table moves the hand onto the
 * table and adds a players panel, which needs different markup, not just CSS.
 */
export const useIsWide = (): boolean => useSyncExternalStore(subscribe, isWideNow, () => false);
