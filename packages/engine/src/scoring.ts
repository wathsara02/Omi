import type { RulesConfig } from './config';
import type { Applied } from './events';
import { teamOf, type Team } from './seats';
import type { GameState, RoundResult, TeamTally } from './state';

export const TRICKS_PER_ROUND = 8;

export interface RoundScoreInput {
  readonly tricks: TeamTally;
  readonly callingTeam: Team;
  /** Carry-over waiting from earlier tied rounds. */
  readonly carryOver: number;
  readonly config: RulesConfig;
}

export interface RoundScore {
  readonly result: RoundResult;
  /** Carry-over to take into the next round. */
  readonly carryOver: number;
}

export const scoreRound = (input: RoundScoreInput): RoundScore => {
  const { tricks, callingTeam, carryOver, config } = input;
  if (tricks.A === tricks.B) {
    const result: RoundResult = {
      winner: null,
      callingTeam,
      tricks,
      isKapothi: false,
      baseTokens: 0,
      carryOverTokens: 0,
      tokensAwarded: 0,
    };
    // Does not stack: consecutive ties leave the carry-over at the configured amount.
    return { result, carryOver: config.tieCarryOver };
  }

  const winner: Team = tricks.A > tricks.B ? 'A' : 'B';
  const isKapothi = tricks[winner] === TRICKS_PER_ROUND;
  const winTokens =
    winner === callingTeam ? config.tokensCallingTeamWin : config.tokensDefendingTeamWin;
  const baseTokens = isKapothi ? config.tokensKapothi : winTokens;
  return {
    result: {
      winner,
      callingTeam,
      tricks,
      isKapothi,
      baseTokens,
      carryOverTokens: carryOver,
      tokensAwarded: baseTokens + carryOver,
    },
    carryOver: 0,
  };
};

export const isRoundComplete = (state: GameState): boolean =>
  state.tricksWon.A + state.tricksWon.B === TRICKS_PER_ROUND;

/** Scores a round whose eighth trick has just been resolved. */
export const finishRound = (state: GameState): Applied => {
  const { result, carryOver } = scoreRound({
    tricks: state.tricksWon,
    callingTeam: teamOf(state.caller),
    carryOver: state.carryOver,
    config: state.config,
  });
  const tokens: TeamTally =
    result.winner === null
      ? state.tokens
      : {
          ...state.tokens,
          [result.winner]: state.tokens[result.winner] + result.tokensAwarded,
        };
  return {
    state: {
      ...state,
      phase: 'round-scored',
      tokens,
      carryOver,
      lastRound: result,
      turn: null,
      currentTrick: null,
    },
    events: [{ type: 'round-scored', result, tokens }],
  };
};
