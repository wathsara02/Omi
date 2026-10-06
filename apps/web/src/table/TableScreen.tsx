import type { Card, Suit } from '@omi/engine';
import type { Ack, GameSnapshot, RoomSnapshot } from '@omi/protocol';
import { useEffect, useState, type ReactElement } from 'react';
import { suitName } from '../cards/cardNames';
import { PlayingCard } from '../cards/PlayingCard';
import { SuitIcon } from '../cards/SuitIcon';
import { tokenScore } from '../state/selectors';
import { Countdown } from '../ui/Countdown';
import { ScoreBars } from '../ui/ScoreBars';
import '../ui/ui.css';
import './table.css';
import { TRUMP_CHOICES, handCardState, sortHand, tableStatus } from './tableStatus';
import { TrickArea } from './TrickArea';

interface TableScreenProps {
  room: RoomSnapshot;
  game: GameSnapshot;
  clockOffset: number;
  onCallTrump: (suit: Suit) => Promise<Ack>;
  onPlayCard: (card: Card) => Promise<Ack>;
  onLeave: () => void;
}

/** How long a finished trick stays on the table before the next one is shown. */
const TRICK_SHOWN_MS = 1600;
const CROWDED_HAND = 6;

interface MoveError {
  readonly seq: number;
  readonly message: string;
}

export function TableScreen({
  room,
  game,
  clockOffset,
  onCallTrump,
  onPlayCard,
  onLeave,
}: TableScreenProps): ReactElement {
  const { view, seq } = game;
  const [shownTrickSeq, setShownTrickSeq] = useState<number | null>(null);
  const [moveError, setMoveError] = useState<MoveError | null>(null);

  // The server has already moved on to the next trick; keep the finished one
  // on screen for a moment so everyone sees who took it.
  const justWon =
    view.phase === 'playing' &&
    view.previousTrick !== null &&
    game.events.some((event) => event.type === 'trick-won');
  useEffect(() => {
    if (!justWon) return undefined;
    const timer = setTimeout(() => setShownTrickSeq(seq), TRICK_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [justWon, seq]);
  const isShowingWonTrick = justWon && shownTrickSeq !== seq;
  const trickWinner = isShowingWonTrick ? (view.previousTrick?.winner ?? null) : null;

  const report = async (request: Promise<Ack>): Promise<void> => {
    const ack = await request;
    setMoveError(ack.ok ? null : { seq, message: ack.error.message });
  };

  const status = tableStatus(view, room, trickWinner);
  const isCallingTrump = view.phase === 'calling-trump' && view.caller === view.seat;
  const hand = sortHand(view.hand);
  // An error belongs to the turn it happened on; the next state clears it.
  const errorText = moveError?.seq === seq ? moveError.message : null;

  return (
    <div className="screen screen--wide table">
      <section className="table__felt">
        <header className="table__header">
          <ScoreBars score={tokenScore(view)} />
          <div className={`table__trump${view.trump ? ' table__trump--called' : ''}`}>
            {view.trump ? (
              <>
                <span>Trump</span>
                <SuitIcon suit={view.trump} size={18} />
                <span className="visually-hidden">{suitName(view.trump)}</span>
              </>
            ) : (
              <span>Round {view.roundNumber} · no trump yet</span>
            )}
          </div>
        </header>

        <TrickArea
          room={room}
          view={view}
          clockOffset={clockOffset}
          trick={isShowingWonTrick ? view.previousTrick : view.currentTrick}
          winner={trickWinner}
        />
      </section>

      <section className="sheet table__sheet" aria-label="Your hand">
        <div className="table__status">
          <div className="table__status-text" role="status">
            <h1 className="table__title">{status.title}</h1>
            {status.hint && <p className="table__hint">{status.hint}</p>}
          </div>
          {game.deadline !== null && !isShowingWonTrick && (
            <Countdown
              deadline={game.deadline}
              startedAt={game.serverNow}
              clockOffset={clockOffset}
              label="Time left"
            />
          )}
        </div>

        {isCallingTrump && (
          <div className="table__suits" role="group" aria-label="Choose trump">
            {TRUMP_CHOICES.map((suit) => (
              <button
                key={suit}
                type="button"
                className={`table__suit table__suit--${suit}`}
                onClick={() => void report(onCallTrump(suit))}
              >
                <SuitIcon suit={suit} size={24} />
                <span>{suitName(suit)}</span>
              </button>
            ))}
          </div>
        )}

        <ul className={`table__hand${hand.length > CROWDED_HAND ? ' table__hand--crowded' : ''}`}>
          {hand.map((card) => (
            <li key={`${card.rank}-${card.suit}`}>
              <PlayingCard
                card={card}
                size="hand"
                state={handCardState(view, card)}
                onPlay={(played) => void report(onPlayCard(played))}
              />
            </li>
          ))}
        </ul>

        {errorText && (
          <p className="error-text" role="alert">
            {errorText}
          </p>
        )}
        {isCallingTrump && (
          <p className="table__footnote">If time runs out, the suit you hold most of is called.</p>
        )}
        <button type="button" className="button button--quiet table__leave" onClick={onLeave}>
          Leave match
        </button>
      </section>
    </div>
  );
}
