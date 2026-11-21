import { AlertCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';

/** Show a short message at the bottom of the screen (errors, confirmations). */
export function toast(message: string, kind: 'error' | 'info' = 'error') {
  window.dispatchEvent(new CustomEvent('hearth:toast', { detail: { message, kind } }));
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; message: string; kind: string }[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const { message, kind } = (e as CustomEvent).detail;
      const id = Date.now() + Math.random();
      setItems((p) => [...p.slice(-2), { id, message, kind }]);
      setTimeout(() => setItems((p) => p.filter((x) => x.id !== id)), 7000);
    };
    window.addEventListener('hearth:toast', on);
    return () => window.removeEventListener('hearth:toast', on);
  }, []);
  if (!items.length) return null;
  return (
    <div className="snackbar-stack" aria-live="assertive">
      {items.map((i) => (
        <div key={i.id} className={`snackbar ${i.kind}`}>
          {i.kind === 'error' && <AlertCircle size={20} />}
          <span className="grow">{i.message}</span>
          <button className="icon-btn" onClick={() => setItems((p) => p.filter((x) => x.id !== i.id))} aria-label={t('Dismiss')}>
            <X size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}
