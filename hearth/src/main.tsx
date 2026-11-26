import '@fontsource-variable/nunito';
import '@fontsource-variable/source-serif-4';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Every change Hearth makes carries this header. The server refuses changes without it, and browsers
// won't let another website add it, so a web page elsewhere can't drive Hearth.
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method === 'GET' || method === 'HEAD' || new URL(href, location.href).origin !== location.origin) return realFetch(input, init);
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  headers.set('X-Hearth', '1');
  return realFetch(input, { ...init, headers });
};

// Installed as a home-screen app: the status bar sits over the page, so the layout makes room for it.
const nav = navigator as Navigator & { standalone?: boolean };
if (window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true) document.documentElement.classList.add('standalone');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
