import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import '@fontsource/gemunu-libre/800.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createConnection, openSocket } from './net/connection';
import './styles/tokens.css';
import './styles/base.css';

const DEFAULT_SERVER_URL = 'http://localhost:3001';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// One connection for the life of the page.
const serverUrl = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? DEFAULT_SERVER_URL;
const connection = createConnection(openSocket(serverUrl));

createRoot(root).render(
  <StrictMode>
    <App connection={connection} />
  </StrictMode>,
);
