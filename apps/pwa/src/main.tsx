import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './stile.css';

const radice = document.getElementById('radice');
if (!radice) throw new Error('Elemento radice non trovato');

createRoot(radice).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
