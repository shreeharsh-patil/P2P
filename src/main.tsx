import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { cleanupOrphanedOPFS } from './utils/opfsCleanup';
import './index.css';

// Best-effort cleanup of OPFS files left behind by earlier transfers.
void cleanupOrphanedOPFS();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
