import type { GameSnapshot } from '@omi/protocol';
import { useEffect, useState } from 'react';

/** How long a finished trick stays on the table before what follows is shown. */
export const TRICK_SHOWN_MS = 1600;
/** How long the last round's result is shown before the match result. */
export const FINAL_RESULT_MS = 5000;

/** trick: the round's last trick is still on the table. result: its result is being shown. */
export type RoundEndStage = 'trick' | 'result';

/** When the match result replaces the last round's result (server time), for the countdown. */
export interface MatchResultClock {
  readonly deadline: number;
  readonly startedAt: number;
}

export interface RoundEnd {
  /** Null when no round end is being played back. */
  readonly stage: RoundEndStage | null;
  readonly matchResult: MatchResultClock;
  /** Server time the round result came on screen: after the last trick, if that was shown. */
  readonly resultShownAt: number;
  /** Ends the playback now, for a player who does not want to wait for the match result. */
  skip(): void;
}

interface Playback {
  readonly seq: number;
  readonly stage: RoundEndStage | 'done';
}

/**
 * Walks a player through the end of a round they watched: the last trick, then
 * the result. The server has already moved on by then, so this is timed here.
 * A state that arrives without the round-end event is a reload or a reconnect,
 * and nothing is played back for it.
 */
export const useRoundEnd = (game: GameSnapshot): RoundEnd => {
  const { seq } = game;
  const isMatchOver = game.view.phase === 'match-over';
  const [seenSeq, setSeenSeq] = useState<number | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);

  if (seenSeq !== seq) {
    setSeenSeq(seq);
    const hasEnded = game.events.some((event) => event.type === 'round-scored');
    if (hasEnded) {
      setPlayback({ seq, stage: 'trick' });
    } else {
      // A later state for a finished match must not cut the ending short;
      // a later state mid-match means the next round is here.
      setPlayback(playback !== null && isMatchOver ? { ...playback, seq } : null);
    }
  }

  const stage = playback?.seq === seq ? playback.stage : null;
  useEffect(() => {
    if (stage === null || stage === 'done') return undefined;
    // Between rounds the result stays until the server deals the next round.
    if (stage === 'result' && !isMatchOver) return undefined;
    const next = stage === 'trick' ? 'result' : 'done';
    const timer = setTimeout(
      () => setPlayback((current) => (current?.seq === seq ? { seq, stage: next } : current)),
      stage === 'trick' ? TRICK_SHOWN_MS : FINAL_RESULT_MS,
    );
    return () => clearTimeout(timer);
  }, [seq, stage, isMatchOver]);

  const startedAt = game.serverNow + TRICK_SHOWN_MS;
  return {
    stage: stage === 'done' ? null : stage,
    matchResult: { startedAt, deadline: startedAt + FINAL_RESULT_MS },
    resultShownAt: stage === null ? game.serverNow : startedAt,
    skip: () =>
      setPlayback((current) => (current === null ? current : { ...current, stage: 'done' })),
  };
};
