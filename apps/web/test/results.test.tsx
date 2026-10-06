import type { PlayerView, RoundResult, Team } from '@omi/engine';
import type { GameSnapshot } from '@omi/protocol';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { MatchEndScreen } from '../src/results/MatchEndScreen';
import { RoundResultScreen } from '../src/results/RoundResultScreen';
import { summariseRound } from '../src/results/roundSummary';
import { SERVER_NOW, autoUntil, newMatch, roomSnapshot, snapshotFor } from './fixtures';

const scoredRound = (): GameSnapshot => {
  const { state } = autoUntil(newMatch(), (each) => each.phase === 'round-scored');
  return snapshotFor(state, 0, { deadline: SERVER_NOW + 4000 });
};

const result = (overrides: Partial<RoundResult>): RoundResult => ({
  winner: 'A',
  callingTeam: 'A',
  tricks: { A: 5, B: 3 },
  isKapothi: false,
  baseTokens: 1,
  carryOverTokens: 0,
  tokensAwarded: 1,
  ...overrides,
});

const viewFor = (team: Team, carryOver = 0): PlayerView => ({
  ...scoredRound().view,
  team,
  carryOver,
});

describe('summariseRound', () => {
  test('a win by the team that called trump', () => {
    expect(summariseRound(viewFor('A'), result({}))).toMatchObject({
      kind: 'won',
      headline: 'You won the round',
      tricks: '5 tricks to 3',
      award: '+1 token',
      explanation: 'Your team called trump, so the win is worth 1 token.',
    });
  });

  test('the same round seen from the losing side', () => {
    expect(summariseRound(viewFor('B'), result({}))).toMatchObject({
      kind: 'lost',
      headline: 'You lost the round',
      award: '+1 token to them',
      explanation: 'The other team called trump, so the win is worth 1 token.',
    });
  });

  test('a win against the team that called trump is worth more', () => {
    const defended = result({
      winner: 'B',
      tricks: { A: 2, B: 6 },
      baseTokens: 2,
      tokensAwarded: 2,
    });

    expect(summariseRound(viewFor('B'), defended)).toMatchObject({
      tricks: '6 tricks to 2',
      award: '+2 tokens',
      explanation: 'Your team beat the team that called trump, so the win is worth 2 tokens.',
    });
  });

  test('a tie awards nothing and names the carry-over', () => {
    const tie = result({ winner: null, tricks: { A: 4, B: 4 }, baseTokens: 0, tokensAwarded: 0 });

    expect(summariseRound(viewFor('A', 1), tie)).toEqual({
      kind: 'tie',
      headline: 'A tied round',
      tricks: '4 tricks each',
      award: 'No tokens',
      explanation: 'Whoever wins the next round gets 1 token extra.',
    });
  });

  test('a kapothi for the player’s team', () => {
    const kapothi = result({
      tricks: { A: 8, B: 0 },
      isKapothi: true,
      baseTokens: 3,
      tokensAwarded: 3,
    });

    expect(summariseRound(viewFor('A'), kapothi)).toMatchObject({
      kind: 'kapothi-won',
      headline: 'Kapothi!',
      tricks: 'All 8 tricks',
      award: '+3 tokens',
    });
  });

  test('a kapothi against the player’s team', () => {
    const kapothi = result({
      tricks: { A: 8, B: 0 },
      isKapothi: true,
      baseTokens: 3,
      tokensAwarded: 3,
    });

    expect(summariseRound(viewFor('B'), kapothi)).toMatchObject({
      kind: 'kapothi-lost',
      headline: 'Kapothi against you',
      award: '+3 tokens to them',
    });
  });

  test('mentions tokens carried over from a tie', () => {
    const afterTie = result({ carryOverTokens: 1, tokensAwarded: 2 });

    const summary = summariseRound(viewFor('A'), afterTie);

    expect(summary.award).toBe('+2 tokens');
    expect(summary.explanation).toContain('includes 1 token carried over from the tie');
  });
});

describe('RoundResultScreen', () => {
  test('shows the outcome, the score and when the next round starts', () => {
    const game = scoredRound();
    render(
      <RoundResultScreen room={roomSnapshot()} game={game} clockOffset={SERVER_NOW - Date.now()} />,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /won the round|lost the round|tied round|Kapothi/,
    );
    expect(screen.getByText(`Round ${game.view.roundNumber}`)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Us: \d+ of 10 tokens$/ })).toBeInTheDocument();
    expect(screen.getByRole('timer', { name: 'Next round in: 0:04' })).toBeInTheDocument();
    expect(screen.getByText(/deals?$/)).toBeInTheDocument();
  });

  test('says "You deal" when the deal passes to the player', () => {
    const game = scoredRound();
    const asCaller = snapshotFor(
      autoUntil(newMatch(), (each) => each.phase === 'round-scored').state,
      game.view.caller,
    );
    render(<RoundResultScreen room={roomSnapshot()} game={asCaller} clockOffset={0} />);

    expect(screen.getByText('You deal')).toBeInTheDocument();
  });
});

describe('MatchEndScreen', () => {
  const finished = (seat: 0 | 1 | 2 | 3): GameSnapshot => {
    const { state } = autoUntil(newMatch(), (each) => each.phase === 'match-over');
    return snapshotFor(state, seat, { deadline: null });
  };

  test('tells winners and losers apart and shows the final score', () => {
    const game = finished(0);
    const didWin = game.view.winner === game.view.team;
    render(<MatchEndScreen room={roomSnapshot()} game={game} onHome={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      didWin ? 'You won the match' : 'You lost the match',
    );
    expect(screen.getByText(/Match over · \d+ rounds/)).toBeInTheDocument();
    expect(screen.getByText('Winners')).toBeInTheDocument();
  });

  test('names both teams, with the player first on their own', () => {
    render(<MatchEndScreen room={roomSnapshot()} game={finished(0)} onHome={vi.fn()} />);

    expect(screen.getByText('You and Nimal')).toBeInTheDocument();
    expect(screen.getByText('Kamala and Sunil')).toBeInTheDocument();
  });

  test('shows the other side of the result to the other team', () => {
    const game = finished(1);
    render(<MatchEndScreen room={roomSnapshot({ youId: 'p1' })} game={game} onHome={vi.fn()} />);

    expect(screen.getByText('You and Sunil')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      game.view.winner === 'B' ? 'You won the match' : 'You lost the match',
    );
  });

  test('goes home', async () => {
    const onHome = vi.fn();
    render(<MatchEndScreen room={roomSnapshot()} game={finished(0)} onHome={onHome} />);

    await userEvent.click(screen.getByRole('button', { name: 'Back to home' }));

    expect(onHome).toHaveBeenCalledTimes(1);
  });
});
