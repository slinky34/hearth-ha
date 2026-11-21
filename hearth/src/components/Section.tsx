import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';

/** A Settings card that folds up. Open/closed is remembered on this device. */
export function Section({
  id,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const key = `hearth.section.${id}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v == null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(key, o ? '0' : '1');
      } catch {
        /* storage blocked */
      }
      return !o;
    });
  };
  return (
    <section className={`card collapsible ${open ? 'open' : ''}`}>
      <button className="section-head" onClick={toggle} aria-expanded={open}>
        <h2>{title}</h2>
        {!open && summary && <span className="section-summary muted small">{summary}</span>}
        <ChevronDown size={22} className="section-chevron" />
      </button>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}
