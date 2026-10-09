import { rankValue, type Card, type PlayerView, type Seat, type Suit } from '@omi/engine';
import type { RoomSnapshot } from '@omi/protocol';
import { suitName } from '../cards/cardNames';
import type { CardState } from '../cards/PlayingCard';
import { playerAtSeat, seatName } from '../state/selectors';

export interface TableStatus {
  readonly title: string;
  readonly hint: string;
}

/** Black and red suits alternate, so neighbouring groups are easy to tell apart. */
const HAND_SUIT_ORDER: readonly Suit[] = ['spades', 'hearts', 'clubs', 'diamonds'];

/** The hand grouped by suit, highest card first. Display only; the server's order is untouched. */
export const sortHand = (hand: readonly Card[]): Card[] =>
  [...hand].sort(
    (a, b) =>
      HAND_SUIT_ORDER.indexOf(a.suit) - HAND_SUIT_ORDER.indexOf(b.suit) ||
      rankValue(b.rank) - rankValue(a.rank),
  );

const isSameCard = (a: Card, b: Card): boolean => a.suit === b.suit && a.rank === b.rank;

export const isMyTurnToPlay = (view: PlayerView): boolean =>
  view.phase === 'playing' && view.turn === view.seat;

/** Only the cards the server lists as legal can be played; the rest are dimmed on the player's turn. */
export const handCardState = (view: PlayerView, card: Card): CardState => {
  if (!isMyTurnToPlay(view)) return 'idle';
  return view.legalMoves.some((legal) => isSameCard(legal, card)) ? 'playable' : 'dimmed';
};

const possessive = (name: string): string => (name === 'You' ? 'Your' : `${name}’s`);

const waitingHint = (room: RoomSnapshot, seat: Seat): string => {
  const player = playerAtSeat(room, seat);
  if (player?.isBot) return 'A bot is playing this seat.';
  if (player && !player.isConnected) return 'They are away. The turn timer still runs.';
  return '';
};

const myTurnHint = (view: PlayerView): string => {
  const ledSuit = view.currentTrick?.plays[0]?.card.suit;
  if (ledSuit === undefined) return 'You lead. Play any card.';
  const mustFollow = view.legalMoves.length < view.hand.length;
  const suit = suitName(ledSuit).toLowerCase();
  return mustFollow ? `Follow ${suit}.` : `You have no ${suit}. Play any card.`;
};

/**
 * The headline and one-line hint under the table. `trickWinner` is set for the
 * moment after a trick, while the four cards are still shown.
 */
export const tableStatus = (
  view: PlayerView,
  room: RoomSnapshot,
  trickWinner: Seat | null,
): TableStatus => {
  if (trickWinner !== null) {
    const winner = seatName(room, view, trickWinner);
    const leadsNext = winner === 'You' ? 'You lead next.' : `${winner} leads next.`;
    return {
      title: `${winner} took the trick`,
      hint: view.phase === 'playing' ? leadsNext : 'That was the last trick of the round.',
    };
  }
  if (view.phase === 'calling-trump') {
    return view.caller === view.seat
      ? { title: 'Name trump', hint: 'Your other 4 cards come after you call.' }
      : {
          title: `${seatName(room, view, view.caller)} is naming trump`,
          hint: 'Everyone gets 4 more cards after the call.',
        };
  }
  if (view.turn === null) return { title: '', hint: '' };
  if (view.turn === view.seat) return { title: 'Your turn', hint: myTurnHint(view) };
  return {
    title: `${possessive(seatName(room, view, view.turn))} turn`,
    hint: waitingHint(room, view.turn),
  };
};

/** The order of the suit buttons: red and black alternate. */
export const TRUMP_CHOICES: readonly Suit[] = ['hearts', 'spades', 'diamonds', 'clubs'];
