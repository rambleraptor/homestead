import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
// Side effect: install the app registry singleton before anything reads it.
import '@/apps/registry';
import { registerServiceWorker } from '@rambleraptor/homestead-core/shared/pwa/serviceWorker';
import './globals.css';
import { App } from './App';

registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
