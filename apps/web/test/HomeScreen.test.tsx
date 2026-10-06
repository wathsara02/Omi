import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { HomeScreen } from '../src/home/HomeScreen';
import { failed, ok } from './fakeSocket';

const setup = (props: Partial<Parameters<typeof HomeScreen>[0]> = {}) => {
  const onCreate = vi.fn(async () => ok(null));
  const onJoin = vi.fn(async () => ok(null));
  render(<HomeScreen initialName="" onCreate={onCreate} onJoin={onJoin} {...props} />);
  return { onCreate, onJoin, user: userEvent.setup() };
};

describe('HomeScreen', () => {
  test('starts with the remembered name', () => {
    setup({ initialName: 'Ruwan' });

    expect(screen.getByLabelText('Your name')).toHaveValue('Ruwan');
  });

  test('creates a room with the trimmed name', async () => {
    const { onCreate, user } = setup();

    await user.type(screen.getByLabelText('Your name'), '  Ruwan ');
    await user.click(screen.getByRole('button', { name: 'Create a room' }));

    expect(onCreate).toHaveBeenCalledWith('Ruwan');
  });

  test('asks for a name before creating', async () => {
    const { onCreate, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Create a room' }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText(/Enter a name/)).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toHaveAttribute('aria-invalid', 'true');
  });

  test('joins with the code in upper case', async () => {
    const { onJoin, user } = setup({ initialName: 'Kamala' });

    await user.type(screen.getByLabelText('Room code'), 'kxt4p9');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(onJoin).toHaveBeenCalledWith('KXT4P9', 'Kamala');
  });

  test('joins when Enter is pressed in the code field', async () => {
    const { onJoin, user } = setup({ initialName: 'Kamala' });

    await user.type(screen.getByLabelText('Room code'), 'KXT4P9{Enter}');

    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  test('refuses a code that is not a room code', async () => {
    const { onJoin, user } = setup({ initialName: 'Kamala' });

    await user.type(screen.getByLabelText('Room code'), 'ABC');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(onJoin).not.toHaveBeenCalled();
    expect(screen.getByText(/6-character room code/)).toBeInTheDocument();
  });

  test('shows the server’s reason when joining is refused', async () => {
    const onJoin = vi.fn(async () => failed('room-full'));
    const { user } = setup({ initialName: 'Kamala', onJoin });

    await user.type(screen.getByLabelText('Room code'), 'KXT4P9');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Server said: room-full');
  });

  test('disables both actions while a request is in flight', async () => {
    let finish: (value: ReturnType<typeof ok<null>>) => void = () => undefined;
    const onCreate = vi.fn(
      () => new Promise<ReturnType<typeof ok<null>>>((resolve) => (finish = resolve)),
    );
    const { user } = setup({ initialName: 'Ruwan', onCreate });

    await user.click(screen.getByRole('button', { name: 'Create a room' }));

    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled();
    finish(ok(null));
    expect(await screen.findByRole('button', { name: 'Create a room' })).toBeEnabled();
  });

  test('opened from a room link, fills in the code and leads with joining', async () => {
    const { onJoin, user } = setup({ linkedCode: 'KXT4P9' });

    expect(screen.getByLabelText('Room code')).toHaveValue('KXT4P9');
    expect(screen.queryByRole('button', { name: 'Create a room' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Your name'), 'Sunil');
    await user.click(screen.getByRole('button', { name: 'Join' }));

    expect(onJoin).toHaveBeenCalledWith('KXT4P9', 'Sunil');
  });

  test('opened from a room link, still offers a new room', async () => {
    const { onCreate, user } = setup({ linkedCode: 'KXT4P9', initialName: 'Sunil' });

    await user.click(screen.getByRole('button', { name: 'Create a new room instead' }));

    expect(onCreate).toHaveBeenCalledWith('Sunil');
  });

  test('shows a player’s name as plain text, never as markup', async () => {
    const { user } = setup();

    await user.type(screen.getByLabelText('Your name'), '<img src=x onerror=alert(1)>');

    expect(document.querySelector('img')).toBeNull();
  });
});
