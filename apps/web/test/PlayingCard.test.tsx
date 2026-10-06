import { createDeck, type Card } from '@omi/engine';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { cardName } from '../src/cards/cardNames';
import { PlayingCard } from '../src/cards/PlayingCard';

const aceOfHearts: Card = { suit: 'hearts', rank: 'A' };
const queenOfSpades: Card = { suit: 'spades', rank: 'Q' };

describe('cardName', () => {
  test('names every card in the deck differently', () => {
    const names = createDeck().map(cardName);

    expect(new Set(names).size).toBe(32);
    expect(names).toContain('Ten of diamonds');
  });
});

describe('PlayingCard', () => {
  test('shows the rank and is named for screen readers', () => {
    render(<PlayingCard card={aceOfHearts} />);

    const card = screen.getByRole('img', { name: 'Ace of hearts' });
    expect(card).toHaveTextContent('A');
  });

  test('adds who played it to the name', () => {
    render(<PlayingCard card={aceOfHearts} note="played by Nimal" />);

    expect(screen.getByRole('img', { name: 'Ace of hearts, played by Nimal' })).toBeInTheDocument();
  });

  test('marks hearts and diamonds red and the other suits black', () => {
    const { rerender } = render(<PlayingCard card={aceOfHearts} />);
    expect(screen.getByRole('img')).toHaveClass('card--red');

    rerender(<PlayingCard card={{ suit: 'diamonds', rank: '7' }} />);
    expect(screen.getByRole('img')).toHaveClass('card--red');

    rerender(<PlayingCard card={queenOfSpades} />);
    expect(screen.getByRole('img')).toHaveClass('card--black');

    rerender(<PlayingCard card={{ suit: 'clubs', rank: '8' }} />);
    expect(screen.getByRole('img')).toHaveClass('card--black');
  });

  test('is a button that plays the card when it is playable', async () => {
    const onPlay = vi.fn();
    render(<PlayingCard card={aceOfHearts} size="hand" state="playable" onPlay={onPlay} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ace of hearts, playable' }));

    expect(onPlay).toHaveBeenCalledWith(aceOfHearts);
  });

  test('can be played from the keyboard', async () => {
    const onPlay = vi.fn();
    render(<PlayingCard card={aceOfHearts} size="hand" state="playable" onPlay={onPlay} />);

    await userEvent.tab();
    await userEvent.keyboard('{Enter}');

    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  test('is a disabled button that does nothing when it is not legal to play', async () => {
    const onPlay = vi.fn();
    render(<PlayingCard card={queenOfSpades} size="hand" state="dimmed" onPlay={onPlay} />);

    const button = screen.getByRole('button', { name: 'Queen of spades, not playable' });
    await userEvent.click(button);

    expect(button).toBeDisabled();
    expect(onPlay).not.toHaveBeenCalled();
  });

  test('carries its size, state and tilt for styling', () => {
    render(<PlayingCard card={aceOfHearts} size="large" state="winner" tilt={-3} />);

    const card = screen.getByRole('img');
    expect(card).toHaveClass('card--large', 'card--winner');
    expect(card.style.getPropertyValue('--card-tilt')).toBe('-3deg');
  });
});
