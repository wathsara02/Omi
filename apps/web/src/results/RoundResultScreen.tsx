import type { GameSnapshot, RoomSnapshot } from '@omi/protocol';
import type { ReactElement } from 'react';
import type { MatchResultClock } from '../state/roundEnd';
import { seatName, tokenScore } from '../state/selectors';
import { Countdown } from '../ui/Countdown';
import { ScoreBars } from '../ui/ScoreBars';
import '../ui/ui.css';
import { useFocusOnMount } from '../ui/useFocusOnMount';
import './results.css';
import { summariseRound } from './roundSummary';

interface RoundResultScreenProps {
  room: RoomSnapshot;
  game: GameSnapshot;
  clockOffset: number;
  /** Set when this round ended the match: the match result follows, not another round. */
  matchResult?: MatchResultClock | null;
  /**
   * Server time this screen appeared, when that was later than the state it shows
   * (the last trick is shown first). The countdown bar is full at this moment.
   */
  shownAt?: number;
  /** After the last round: go to the match result without waiting. */
  onSkip?: () => void;
}

export function RoundResultScreen({
  room,
  game,
  clockOffset,
  matchResult = null,
  shownAt,
  onSkip,
}: RoundResultScreenProps): ReactElement | null {
  const headline = useFocusOnMount<HTMLHeadingElement>();
  const { view } = game;
  if (view.lastRound === null) return null;
  const summary = summariseRound(view, view.lastRound);
  const score = tokenScore(view);
  // The deal passes to this round's trump caller.
  const nextDealer = seatName(room, view, view.caller);
  const dealsText = nextDealer === 'You' ? 'You deal' : `${nextDealer} deals`;
  const next: MatchResultClock | null =
    matchResult ??
    (game.deadline === null
      ? null
      : { deadline: game.deadline, startedAt: shownAt ?? game.serverNow });

  return (
    <div className="screen result">
      <main className={`result__body result__body--${summary.kind}`}>
        <div className="result__summary">
          <span className="eyebrow">Round {view.roundNumber}</span>
          <h1 className="result__headline" tabIndex={-1} ref={headline}>
            {summary.headline}
          </h1>
          <div className="result__row">
            <span className="result__tricks">{summary.tricks}</span>
            <span
              className={`pill pill--accent${summary.kind === 'tie' ? ' result__no-award' : ''}`}
            >
              {summary.award}
            </span>
          </div>
          <p className="result__explanation">{summary.explanation}</p>
        </div>
        <div className="result__score">
          <ScoreBars score={score} tone="large" />
          <span className="result__target">First to {score.target} wins the match</span>
        </div>
      </main>

      <footer className="sheet result__footer">
        <div className="result__next">
          <span className="result__next-title">{matchResult ? 'Match over' : 'Next round'}</span>
          <span className="muted">{matchResult ? 'The match result is next' : dealsText}</span>
        </div>
        {next !== null && (
          <Countdown
            deadline={next.deadline}
            startedAt={next.startedAt}
            clockOffset={clockOffset}
            label={matchResult ? 'Match result in' : 'Next round in'}
            tone="calm"
          />
        )}
        {matchResult !== null && onSkip !== undefined && (
          <button type="button" className="button button--primary" onClick={onSkip}>
            See match result
          </button>
        )}
      </footer>
    </div>
  );
}
