import { useEffect, useRef, type RefObject } from 'react';

/**
 * Moves focus to an element when its screen appears. A screen that replaces
 * another without the player doing anything is otherwise silent to a screen
 * reader; focusing its headline has it read out. The element needs tabIndex -1.
 */
export const useFocusOnMount = <T extends HTMLElement>(): RefObject<T | null> => {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
};
