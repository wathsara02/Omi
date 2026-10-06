import { otherTeam, teamOf, type Team } from '@omi/engine';
import type { GameSnapshot, RoomSnapshot } from '@omi/protocol';
import type { ReactElement } from 'react';
import { seatName } from '../state/selectors';
import { Avatar } from '../ui/Avatar';
import '../ui/ui.css';
import './results.css';

interface MatchEndScreenProps {
  room: RoomSnapshot;
  game: GameSnapshot;
  onHome: () => void;
}

const SEATS = [0, 1, 2, 3] as const;

export function MatchEndScreen({ room, game, onHome }: MatchEndScreenProps): ReactElement {
  const { view } = game;
  const didWin = view.winner === view.team;
  const theirTeam = otherTeam(view.team);

  // The player's own name first, so their team reads "You and Nimal".
  const namesOf = (team: Team): string[] =>
    SEATS.filter((seat) => teamOf(seat) === team)
      .map((seat) => seatName(room, view, seat))
      .sort((a, b) => Number(b === 'You') - Number(a === 'You'));

  const teamRow = (team: Team): ReactElement => {
    const names = namesOf(team);
    const isWinner = view.winner === team;
    return (
      <li className={`end__team${isWinner ? ' end__team--winner' : ''}`}>
        <div className="end__avatars">
          {names.map((name, position) => (
            // Two players may share a name, so the position is the only safe key.
            <Avatar key={position} name={name} tone="outlined" />
          ))}
        </div>
        <div className="end__team-text">
          <span className="end__team-names">{names.join(' and ')}</span>
          {isWinner && <span className="end__team-note">Winners</span>}
        </div>
        <span className="end__team-score">{view.tokens[team]}</span>
      </li>
    );
  };

  return (
    <div className="screen end">
      <header className="end__header">
        <span className="eyebrow">Match over · {view.roundNumber} rounds</span>
        <h1 className="end__headline">{didWin ? 'You won the match' : 'You lost the match'}</h1>
        <p
          className="end__score"
          aria-label={`${view.tokens[view.team]} to ${view.tokens[theirTeam]}`}
        >
          <span>{view.tokens[view.team]}</span>
          <span className="end__dash">–</span>
          <span className="end__score-them">{view.tokens[theirTeam]}</span>
        </p>
      </header>

      <main className="sheet end__sheet">
        <ul className="end__teams">
          {teamRow(view.team)}
          {teamRow(theirTeam)}
        </ul>
        <button type="button" className="button button--primary" onClick={onHome}>
          Back to home
        </button>
        <p className="end__note">This room closes 10 minutes after the match ends.</p>
      </main>
    </div>
  );
}
