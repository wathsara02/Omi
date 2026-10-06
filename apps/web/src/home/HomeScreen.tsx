import type { Ack } from '@omi/protocol';
import {
  PLAYER_NAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  playerNameSchema,
  roomCodeSchema,
} from '@omi/protocol';
import { useId, useState, type FormEvent, type ReactElement } from 'react';
import { PlayingCard } from '../cards/PlayingCard';
import '../ui/ui.css';
import './home.css';

interface HomeScreenProps {
  initialName: string;
  /** Set when the player opened a room link: the code is filled in and joining comes first. */
  linkedCode?: string;
  onCreate: (name: string) => Promise<Ack<unknown>>;
  onJoin: (code: string, name: string) => Promise<Ack<unknown>>;
}

type Busy = 'create' | 'join' | null;

const NAME_PROBLEM = `Enter a name of 1 to ${PLAYER_NAME_MAX_LENGTH} characters.`;
const CODE_PROBLEM = `Enter the ${ROOM_CODE_LENGTH}-character room code.`;

export function HomeScreen({
  initialName,
  linkedCode,
  onCreate,
  onJoin,
}: HomeScreenProps): ReactElement {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(linkedCode ?? '');
  const [busy, setBusy] = useState<Busy>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const nameId = useId();
  const codeId = useId();
  const nameErrorId = useId();
  const codeErrorId = useId();

  const validName = (): string | null => {
    const parsed = playerNameSchema.safeParse(name);
    setNameError(parsed.success ? null : NAME_PROBLEM);
    return parsed.success ? parsed.data : null;
  };

  const run = async (kind: Exclude<Busy, null>, request: () => Promise<Ack<unknown>>) => {
    setServerError(null);
    setBusy(kind);
    const ack = await request();
    setBusy(null);
    if (!ack.ok) setServerError(ack.error.message);
  };

  const create = (): void => {
    setCodeError(null);
    const validated = validName();
    if (validated !== null) void run('create', () => onCreate(validated));
  };

  const join = (event: FormEvent): void => {
    event.preventDefault();
    const validated = validName();
    const parsedCode = roomCodeSchema.safeParse(code);
    setCodeError(parsedCode.success ? null : CODE_PROBLEM);
    if (validated !== null && parsedCode.success) {
      void run('join', () => onJoin(parsedCode.data, validated));
    }
  };

  const isBusy = busy !== null;
  return (
    <div className="screen home">
      <header className="home__hero">
        <div className="home__intro">
          <h1 className="home__title">Omi</h1>
          <p className="home__tagline">
            Four players, two teams. Call trump, win tricks, first to ten tokens.
          </p>
        </div>
        <div className="home__cards" aria-hidden="true">
          <PlayingCard card={{ suit: 'clubs', rank: 'J' }} size="large" tilt={-12} />
          <PlayingCard card={{ suit: 'hearts', rank: 'A' }} size="large" />
          <PlayingCard card={{ suit: 'spades', rank: 'K' }} size="large" tilt={12} />
        </div>
      </header>

      <form className="sheet home__form" onSubmit={join} noValidate>
        <div className="field">
          <label className="field__label" htmlFor={nameId}>
            Your name
          </label>
          <input
            id={nameId}
            className="field__input"
            type="text"
            autoComplete="nickname"
            maxLength={PLAYER_NAME_MAX_LENGTH}
            value={name}
            aria-invalid={nameError !== null}
            aria-describedby={nameError ? nameErrorId : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          {nameError && (
            <span id={nameErrorId} className="error-text">
              {nameError}
            </span>
          )}
        </div>

        {linkedCode === undefined && (
          <>
            <button
              type="button"
              className="button button--primary"
              disabled={isBusy}
              onClick={create}
            >
              {busy === 'create' ? 'Creating…' : 'Create a room'}
            </button>
            <div className="home__divider">
              <span>or join a friend</span>
            </div>
          </>
        )}

        <div className="field">
          <label className="field__label" htmlFor={codeId}>
            Room code
          </label>
          <div className="home__join">
            <input
              id={codeId}
              className="field__input field__input--code"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="ABC234"
              maxLength={ROOM_CODE_LENGTH}
              value={code}
              aria-invalid={codeError !== null}
              aria-describedby={codeError ? codeErrorId : undefined}
              onChange={(event) => setCode(event.target.value)}
            />
            <button
              type="submit"
              className={`button ${linkedCode === undefined ? 'button--outline' : 'button--primary'} home__join-button`}
              disabled={isBusy}
            >
              {busy === 'join' ? 'Joining…' : 'Join'}
            </button>
          </div>
          {codeError && (
            <span id={codeErrorId} className="error-text">
              {codeError}
            </span>
          )}
        </div>

        {serverError && (
          <p className="error-text" role="alert">
            {serverError}
          </p>
        )}

        {linkedCode !== undefined && (
          <button type="button" className="button button--quiet" disabled={isBusy} onClick={create}>
            Create a new room instead
          </button>
        )}
      </form>
    </div>
  );
}
