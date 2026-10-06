import { roomCodeSchema } from '@omi/protocol';
import { useCallback, useEffect, useState } from 'react';

export type Route = { readonly name: 'home' } | { readonly name: 'room'; readonly code: string };

const HOME: Route = { name: 'home' };
const ROOM_PATH = /^\/r\/([^/]+)\/?$/;

export const HOME_PATH = '/';

export const roomPath = (code: string): string => `/r/${code}`;

/** Anything that is not a well-formed room link is the home screen. */
export const parseRoute = (pathname: string): Route => {
  const candidate = ROOM_PATH.exec(pathname)?.[1];
  const code = roomCodeSchema.safeParse(candidate);
  return code.success ? { name: 'room', code: code.data } : HOME;
};

/** The current route and a function to move to another path. */
export const useRoute = (): readonly [Route, (path: string) => void] => {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPopState = (): void => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((path: string): void => {
    if (path !== window.location.pathname) window.history.pushState(null, '', path);
    setRoute(parseRoute(path));
  }, []);

  return [route, navigate];
};
