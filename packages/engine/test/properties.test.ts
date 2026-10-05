import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { applyAction } from '../src/applyAction';
import { applyAutoAction } from '../src/auto';
import { cardKey } from '../src/cards';
import { DEFAULT_RULES } from '../src/config';
import { SEATS } from '../src/seats';
import type { GameState } from '../src/state';
import { viewFor } from '../src/view';
import {
  collectCards,
  collectKeys,
  collectNumbers,
  deepFreeze,
  mustApply,
  mustCreate,
  nextRound,
  playLastTrick,
} from './helpers';
import { playAutoMatch, playRandomMatch, type PlayedMatch } from './matchDriver';

const VIEW_HIDDEN_KEYS = ['rng', 'stock', 'hands'];
const EVENT_HIDDEN_KEYS = [...VIEW_HIDDEN_KEYS, 'hand'];
const MATCH_RUNS = { numRuns: 30 };

const matches = fc.tuple(fc.integer(), fc.integer());

const forEveryMatch = (check: (match: PlayedMatch) => void): void => {
  fc.assert(
    fc.property(matches, ([seed, choiceSeed]) => check(playRandomMatch(seed, choiceSeed))),
    MATCH_RUNS,
  );
};

/** Keys of the cards face up on the table: the current trick and the one before it. */
const tableCards = (state: GameState): Set<string> =>
  new Set(collectCards([state.currentTrick, state.previousTrick]).map(cardKey));

describe('events contain only public information', () => {
  test('every card in an event is face up on the table after the action', () => {
    forEveryMatch(({ steps }) => {
      for (const step of steps) {
        const faceUp = tableCards(step.after);

        const inEvents = collectCards(step.events).map(cardKey);

        expect(inEvents.filter((key) => !faceUp.has(key))).toEqual([]);
      }
    });
  });

  test('no event carries a hand, the stock or the rng state', () => {
    forEveryMatch(({ steps }) => {
      const keys = steps.flatMap((step) => collectKeys(step.events));

      expect(keys.filter((key) => EVENT_HIDDEN_KEYS.includes(key))).toEqual([]);
    });
  });

  test('only card-played events carry a card, and it is the card just played', () => {
    forEveryMatch(({ steps }) => {
      for (const { before, events } of steps) {
        for (const event of events) {
          if (event.type === 'card-played') {
            expect(before.hands[event.seat].map(cardKey)).toContain(cardKey(event.card));
          } else {
            expect(collectCards(event)).toEqual([]);
          }
        }
      }
    });
  });

  test('dealing reveals no cards: trump-called and round-started carry none', () => {
    const dealt = mustCreate(8);
    const called = mustApply(dealt, { type: 'call-trump', seat: dealt.caller, suit: 'clubs' });
    const restarted = mustApply(playLastTrick().state, nextRound());

    expect(collectCards(called.events)).toEqual([]);
    expect(collectCards(restarted.events)).toEqual([]);
  });
});

describe('the rng state stays on the server', () => {
  test('no number in any view or event equals a word of the rng state', () => {
    forEveryMatch(({ steps }) => {
      const leaks = steps.flatMap(({ after, events }) => {
        const words = new Set<number>(after.rng);
        const sent = [events, ...SEATS.map((seat) => viewFor(after, seat))];
        return collectNumbers(sent).filter((value) => words.has(value));
      });

      expect(leaks).toEqual([]);
    });
  });
});

describe('views contain only what the player may see', () => {
  test('no view ever contains the rng state, the stock or another hand', () => {
    forEveryMatch(({ steps }) => {
      const leaks = steps.flatMap(({ after }) => {
        const faceUp = tableCards(after);
        return SEATS.flatMap((seat) => {
          const view = viewFor(after, seat);
          const own = new Set(after.hands[seat].map(cardKey));
          return [
            ...collectKeys(view).filter((key) => VIEW_HIDDEN_KEYS.includes(key)),
            ...collectCards(view)
              .map(cardKey)
              .filter((key) => !own.has(key) && !faceUp.has(key)),
          ];
        });
      });

      expect(leaks).toEqual([]);
    });
  });
});

describe('match invariants', () => {
  test('the 32 cards are always accounted for exactly once within a round', () => {
    forEveryMatch(({ steps }) => {
      let played: string[] = [];
      for (const { after, events } of steps) {
        if (events.some((event) => event.type === 'round-started')) played = [];
        played = [
          ...played,
          ...events.flatMap((event) => (event.type === 'card-played' ? [cardKey(event.card)] : [])),
        ];
        const held = [...after.hands.flat(), ...after.stock].map(cardKey);

        expect(new Set([...held, ...played]).size).toBe(32);
        expect(held.length + played.length).toBe(32);
      }
    });
  });

  test('tokens never go down and tricks never exceed 8', () => {
    forEveryMatch(({ steps }) => {
      for (const { before, after } of steps) {
        expect(after.tokens.A).toBeGreaterThanOrEqual(before.tokens.A);
        expect(after.tokens.B).toBeGreaterThanOrEqual(before.tokens.B);
        expect(after.tricksWon.A + after.tricksWon.B).toBeLessThanOrEqual(8);
      }
    });
  });

  test('every round is played to exactly 8 tricks before it is scored', () => {
    forEveryMatch(({ steps }) => {
      const scored = steps.flatMap((step) =>
        step.events.flatMap((event) => (event.type === 'round-scored' ? [event.result] : [])),
      );

      expect(scored.length).toBeGreaterThan(0);
      for (const result of scored) expect(result.tricks.A + result.tricks.B).toBe(8);
    });
  });

  test('a match ends with exactly one team at or past the token target', () => {
    forEveryMatch(({ finalState }) => {
      const { winner, tokens } = finalState;
      if (winner === null) throw new Error('Finished match has no winner');
      const loser = winner === 'A' ? 'B' : 'A';

      expect(tokens[winner]).toBeGreaterThanOrEqual(DEFAULT_RULES.tokenTarget);
      expect(tokens[loser]).toBeLessThan(DEFAULT_RULES.tokenTarget);
    });
  });

  test('no action changes the state it was given, even when that state is deep-frozen', () => {
    let state = deepFreeze(mustCreate(5));
    while (state.phase !== 'match-over') {
      const result =
        state.phase === 'round-scored'
          ? applyAction(state, nextRound(state.roundNumber))
          : applyAutoAction(state);
      if (!result.ok) throw new Error(result.error.message);
      state = deepFreeze(result.value.state);
    }

    expect(state.winner).not.toBeNull();
  });
});

describe('seeded replay', () => {
  test('the same seed replays the same match, event for event', () => {
    expect(playAutoMatch(2024)).toEqual(playAutoMatch(2024));
  });

  test('a match played only by auto-actions finishes for any seed', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        expect(playAutoMatch(seed).finalState.phase).toBe('match-over');
      }),
      MATCH_RUNS,
    );
  });

  test('seed 2024 keeps producing the same result', () => {
    const { finalState, steps } = playAutoMatch(2024);

    expect({
      winner: finalState.winner,
      tokens: finalState.tokens,
      rounds: finalState.roundNumber,
      actions: steps.length,
    }).toMatchInlineSnapshot(`
      {
        "actions": 373,
        "rounds": 11,
        "tokens": {
          "A": 10,
          "B": 4,
        },
        "winner": "A",
      }
    `);
  });
});
