import '@fontsource-variable/nunito';
import '@fontsource-variable/source-serif-4';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Installed as a home-screen app: iPadOS draws window controls over the top-left corner,
// and the status bar sits over the page, so the layout makes room for both.
const nav = navigator as Navigator & { standalone?: boolean };
const standalone = window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
const ipad = /iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
if (standalone) document.documentElement.classList.add('standalone');
if (standalone && ipad) document.documentElement.classList.add('ipad-app');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
