import { otherTeam, type PlayerView, type RoundResult } from '@omi/engine';

export interface RoundSummary {
  readonly kind: 'won' | 'lost' | 'tie' | 'kapothi-won' | 'kapothi-lost';
  readonly headline: string;
  readonly tricks: string;
  /** The tokens awarded, as a short label. */
  readonly award: string;
  readonly explanation: string;
}

const tokens = (count: number): string => (count === 1 ? '1 token' : `${count} tokens`);

const carriedNote = (result: RoundResult): string =>
  result.carryOverTokens > 0
    ? ` That includes ${tokens(result.carryOverTokens)} carried over from the tie.`
    : '';

/** Words for the round that was just scored, from this player's side of the table. */
export const summariseRound = (view: PlayerView, result: RoundResult): RoundSummary => {
  if (result.winner === null) {
    return {
      kind: 'tie',
      headline: 'A tied round',
      tricks: '4 tricks each',
      award: 'No tokens',
      explanation: `Whoever wins the next round gets ${tokens(view.carryOver)} extra.`,
    };
  }

  const didWin = result.winner === view.team;
  const winnerTricks = result.tricks[result.winner];
  const loserTricks = result.tricks[otherTeam(result.winner)];
  const side = didWin ? 'Your team' : 'The other team';
  const award = `+${tokens(result.tokensAwarded)}${didWin ? '' : ' to them'}`;

  if (result.isKapothi) {
    return {
      kind: didWin ? 'kapothi-won' : 'kapothi-lost',
      headline: didWin ? 'Kapothi!' : 'Kapothi against you',
      tricks: 'All 8 tricks',
      award,
      explanation: `${side} took every trick, which is worth ${tokens(result.baseTokens)}.${carriedNote(result)}`,
    };
  }

  const calledTrump = result.winner === result.callingTeam;
  const reason = calledTrump
    ? `${side} called trump, so the win is worth ${tokens(result.baseTokens)}.`
    : `${side} beat the team that called trump, so the win is worth ${tokens(result.baseTokens)}.`;
  return {
    kind: didWin ? 'won' : 'lost',
    headline: didWin ? 'You won the round' : 'You lost the round',
    tricks: `${winnerTricks} tricks to ${loserTricks}`,
    award,
    explanation: reason + carriedNote(result),
  };
};
