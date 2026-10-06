import type { GameSnapshot, RoomSnapshot } from '@omi/protocol';
import type { ReactElement } from 'react';
import { seatName, tokenScore } from '../state/selectors';
import { Countdown } from '../ui/Countdown';
import { ScoreBars } from '../ui/ScoreBars';
import '../ui/ui.css';
import './results.css';
import { summariseRound } from './roundSummary';

interface RoundResultScreenProps {
  room: RoomSnapshot;
  game: GameSnapshot;
  clockOffset: number;
}

export function RoundResultScreen({
  room,
  game,
  clockOffset,
}: RoundResultScreenProps): ReactElement | null {
  const { view } = game;
  if (view.lastRound === null) return null;
  const summary = summariseRound(view, view.lastRound);
  const score = tokenScore(view);
  // The deal passes to this round's trump caller.
  const nextDealer = seatName(room, view, view.caller);
  const dealsText = nextDealer === 'You' ? 'You deal' : `${nextDealer} deals`;

  return (
    <div className="screen result">
      <main className={`result__body result__body--${summary.kind}`}>
        <div className="result__summary">
          <span className="eyebrow">Round {view.roundNumber}</span>
          <h1 className="result__headline">{summary.headline}</h1>
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
          <span className="result__next-title">Next round</span>
          <span className="muted">{dealsText}</span>
        </div>
        {game.deadline !== null && (
          <Countdown
            deadline={game.deadline}
            startedAt={game.serverNow}
            clockOffset={clockOffset}
            label="Next round in"
            tone="calm"
          />
        )}
      </footer>
    </div>
  );
}
