import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/app';
import { reloadOnHistoryRestore } from './app/reload-on-history-restore';
import { reloadIntoLogin } from './shared/api/reload-into-login';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root was not found.');
}

reloadOnHistoryRestore(window, reloadIntoLogin);

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
