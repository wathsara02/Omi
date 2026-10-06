import type { Card, CompletedTrick, Suit } from '@omi/engine';
import type { Ack, GameSnapshot, RoomSnapshot } from '@omi/protocol';
import { useEffect, useState, type ReactElement } from 'react';
import { suitName } from '../cards/cardNames';
import { PlayingCard } from '../cards/PlayingCard';
import { SuitIcon } from '../cards/SuitIcon';
import { tokenScore } from '../state/selectors';
import { Countdown } from '../ui/Countdown';
import { ScoreBars } from '../ui/ScoreBars';
import '../ui/ui.css';
import { PlayersPanel } from './PlayersPanel';
import './table.css';
import { TRUMP_CHOICES, handCardState, sortHand, tableStatus } from './tableStatus';
import { TrickArea } from './TrickArea';
import { useIsWide } from './useIsWide';

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

/** A finished trick being kept on the table, and the state it arrived with. */
interface HeldTrick {
  readonly seq: number;
  readonly trick: CompletedTrick;
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
  const isWide = useIsWide();
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
  const isShowingWonTrick = heldTrick !== null;
  const trickWinner = heldTrick?.trick.winner ?? null;

  const report = async (request: Promise<Ack>): Promise<void> => {
    const ack = await request;
    setMoveError(ack.ok ? null : { seq, message: ack.error.message });
  };

  const status = tableStatus(view, room, trickWinner);
  const isCallingTrump = view.phase === 'calling-trump' && view.caller === view.seat;
  const hand = sortHand(view.hand);
  // An error belongs to the turn it happened on; the next state clears it.
  const errorText = moveError?.seq === seq ? moveError.message : null;

  const trumpPill = (
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
  );

  const trick = (
    <TrickArea
      room={room}
      view={view}
      clockOffset={clockOffset}
      trick={heldTrick?.trick ?? view.currentTrick}
      winner={trickWinner}
      cardSize={isWide ? 'large' : 'table'}
    />
  );

  const statusBlock = (
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
  );

  const trumpPicker = isCallingTrump && (
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
  );

  const handClasses = [
    'table__hand',
    hand.length > CROWDED_HAND ? 'table__hand--crowded' : '',
    isWide ? 'table__hand--felt' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const handRow = (
    <ul className={handClasses} aria-label="Your hand">
      {hand.map((card) => (
        <li key={`${card.rank}-${card.suit}`}>
          <PlayingCard
            card={card}
            size={isWide ? 'large' : 'hand'}
            state={handCardState(view, card)}
            onPlay={(played) => void report(onPlayCard(played))}
          />
        </li>
      ))}
    </ul>
  );

  const notes = (
    <>
      {errorText && (
        <p className="error-text" role="alert">
          {errorText}
        </p>
      )}
      {isCallingTrump && (
        <p className="table__footnote">If time runs out, the suit you hold most of is called.</p>
      )}
    </>
  );

  const leaveButton = (
    <button type="button" className="button button--quiet table__leave" onClick={onLeave}>
      Leave match
    </button>
  );

  if (isWide) {
    // Desktop (docs/design/TableDesktop): the hand sits on the table and a side
    // panel carries the turn, the tokens and the players.
    return (
      <div className="screen screen--wide table table--wide">
        <section className="table__felt">
          <header className="table__header">
            <span className="eyebrow">
              Room {room.code} · Round {view.roundNumber}
            </span>
            {trumpPill}
          </header>
          {trick}
          {handRow}
        </section>
        <aside className="sheet table__panel" aria-label="Match">
          {statusBlock}
          {trumpPicker}
          {notes}
          <section className="table__tokens" aria-labelledby="tokens-heading">
            <h2 id="tokens-heading" className="eyebrow">
              Tokens · first to {view.config.tokenTarget}
            </h2>
            <ScoreBars score={tokenScore(view)} tone="sheet" />
          </section>
          <PlayersPanel room={room} view={view} clockOffset={clockOffset} />
          {leaveButton}
        </aside>
      </div>
    );
  }

  return (
    <div className="screen table">
      <section className="table__felt">
        <header className="table__header">
          <ScoreBars score={tokenScore(view)} />
          {trumpPill}
        </header>
        {trick}
      </section>
      <section className="sheet table__sheet" aria-label="Your turn and hand">
        {statusBlock}
        {trumpPicker}
        {handRow}
        {notes}
        {leaveButton}
      </section>
    </div>
  );
}
