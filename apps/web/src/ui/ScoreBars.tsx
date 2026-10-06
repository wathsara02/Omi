import type { ReactElement } from 'react';
import type { Score } from '../state/selectors';
import './ui.css';

interface ScoreBarsProps {
  score: Score;
  /** table: compact, on green. large: the round result. sheet: on white. */
  tone?: 'table' | 'large' | 'sheet';
}

const PERCENT = 100;

const share = (value: number, target: number): string =>
  `${Math.min(PERCENT, (value / target) * PERCENT)}%`;

/** Tokens for both teams as progress towards the target. */
export function ScoreBars({ score, tone = 'table' }: ScoreBarsProps): ReactElement {
  const rows = [
    { key: 'us', label: 'Us', value: score.us },
    { key: 'them', label: 'Them', value: score.them },
  ] as const;
  return (
    <div className={`score score--${tone}`}>
      {rows.map((row) => (
        <div key={row.key} className={`score__row score__row--${row.key}`}>
          <span className="score__label">{row.label}</span>
          <div
            className="score__track"
            role="img"
            aria-label={`${row.label}: ${row.value} of ${score.target} tokens`}
          >
            <div className="score__fill" style={{ width: share(row.value, score.target) }} />
          </div>
          <span className="score__value" aria-hidden="true">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}
