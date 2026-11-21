import '@fontsource-variable/nunito';
import '@fontsource-variable/source-serif-4';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Installed as a home-screen app: the status bar sits over the page, so the layout makes room for it.
const nav = navigator as Navigator & { standalone?: boolean };
if (window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true) document.documentElement.classList.add('standalone');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
