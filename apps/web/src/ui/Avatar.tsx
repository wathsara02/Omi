import type { ReactElement } from 'react';
import './ui.css';

interface AvatarProps {
  name: string;
  tone?: 'plain' | 'solid' | 'outlined' | 'away';
}

/** A player's initial. Decorative: the name is always shown beside it. */
export function Avatar({ name, tone = 'plain' }: AvatarProps): ReactElement {
  // Array.from keeps a letter with its accents, or an emoji, in one piece.
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?';
  return (
    <span className={`avatar avatar--${tone}`} aria-hidden="true">
      {initial}
    </span>
  );
}
