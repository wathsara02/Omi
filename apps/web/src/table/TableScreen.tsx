import type { Card, CompletedTrick, Suit } from '@omi/engine';
import type { Ack, GameSnapshot, RoomSnapshot } from '@omi/protocol';
import { useEffect, useState, type ReactElement } from 'react';
import { suitName } from '../cards/cardNames';
import { PlayingCard } from '../cards/PlayingCard';
import { SuitIcon } from '../cards/SuitIcon';
import { findMe, tokenScore } from '../state/selectors';
import { ScoreBars } from '../ui/ScoreBars';
import '../ui/ui.css';
import './table.css';
import { TRUMP_CHOICES, handCardState, sortHand, tableStatus } from './tableStatus';
import { TrickArea } from './TrickArea';
import { TurnAvatar, type TurnClock } from './TurnAvatar';

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
const MS_PER_SECOND = 1000;

interface MoveError {
  readonly seq: number;
  readonly message: string;
}

/** A finished trick being kept on the table, and the state it arrived with. */
interface HeldTrick {
  readonly seq: number;
  readonly trick: CompletedTrick;
}

/** The same layout at every size; a wide window only scales it up (see table.css). */
export function TableScreen({
  room,
  game,
  clockOffset,
  onCallTrump,
  onPlayCard,
  onLeave,
}: TableScreenProps): ReactElement {
  const { view, seq } = game;
  const [heldTrick, setHeldTrick] = useState<HeldTrick | null>(null);
  const [seenSeq, setSeenSeq] = useState<number | null>(null);
  const [moveError, setMoveError] = useState<MoveError | null>(null);

  // The server has already moved on to the next trick; keep the finished one
  // on screen for a moment so everyone sees who took it. It is captured when
  // its state arrives, so a quick next card does not cut the moment short.
  if (seenSeq !== seq) {
    setSeenSeq(seq);
    const wasWon = game.events.some((event) => event.type === 'trick-won');
    if (wasWon && view.phase === 'playing' && view.previousTrick !== null) {
      setHeldTrick({ seq, trick: view.previousTrick });
    }
  }
  const heldSeq = heldTrick?.seq;
  useEffect(() => {
    if (heldSeq === undefined) return undefined;
    const timer = setTimeout(() => setHeldTrick(null), TRICK_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [heldSeq]);
  const trickWinner = heldTrick?.trick.winner ?? null;

  const report = async (request: Promise<Ack>): Promise<void> => {
    const ack = await request;
    setMoveError(ack.ok ? null : { seq, message: ack.error.message });
  };

  const status = tableStatus(view, room, trickWinner);
  const isCallingTrump = view.phase === 'calling-trump' && view.caller === view.seat;
  // While a won trick is shown nobody is "on turn" yet, so there is no ring or banner.
  const isMyAction = trickWinner === null && view.turn === view.seat;
  const turnClock: TurnClock | null =
    trickWinner === null && game.deadline !== null
      ? { deadline: game.deadline, turnMs: view.config.turnTimerSeconds * MS_PER_SECOND }
      : null;
  const hand = sortHand(view.hand);
  // An error belongs to the turn it happened on; the next state clears it.
  const errorText = moveError?.seq === seq ? moveError.message : null;
  const handClasses = `table__hand${hand.length > CROWDED_HAND ? ' table__hand--crowded' : ''}`;

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
          trick={heldTrick?.trick ?? view.currentTrick}
          winner={trickWinner}
          turnClock={turnClock}
        />
      </section>

      <section className="sheet table__sheet" aria-label="Your seat and hand">
        {/* The heading is the spoken version; the banner is the same words for the eye. */}
        {status.title && <h1 className="visually-hidden">{status.title}</h1>}
        {isMyAction && (
          <p className="table__banner" aria-hidden="true">
            Your turn
          </p>
        )}

        <div className="table__me" role="group" aria-label={isMyAction ? 'You, to play' : 'You'}>
          <div className="table__me-seat">
            <TurnAvatar
              name={findMe(room)?.name ?? 'You'}
              tone="sheet"
              isOnTurn={isMyAction}
              clock={isMyAction ? turnClock : null}
              clockOffset={clockOffset}
              showSeconds
            />
          </div>
          <div className="table__me-text" role="status">
            <span className="table__me-name">You</span>
            <span className="table__me-line">{isMyAction ? status.hint : status.title}</span>
            {!isMyAction && status.hint && <span className="table__hint">{status.hint}</span>}
          </div>
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

        <ul className={handClasses} aria-label="Your hand">
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

        {(errorText || isCallingTrump) && (
          <div className="table__notes">
            {errorText && (
              <p className="error-text" role="alert">
                {errorText}
              </p>
            )}
            {isCallingTrump && (
              <p className="table__footnote">
                If time runs out, the suit you hold most of is called.
              </p>
            )}
          </div>
        )}

        <button type="button" className="button button--quiet table__leave" onClick={onLeave}>
          Leave match
        </button>
      </section>
    </div>
  );
}
