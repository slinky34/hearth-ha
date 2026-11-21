import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { t } from '../lib/i18n';
import type { EntityInfo } from '../lib/types';

/** Compact multi-select for HA entities: chosen ones as chips, plus a search box with results. */
export function EntityPicker({
  entities,
  selected,
  onChange,
  placeholder,
  emptyHint,
  labelFor,
}: {
  entities: EntityInfo[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  emptyHint?: string;
  /** Name for a chosen id that isn't in `entities` right now. */
  labelFor?: (id: string) => string;
}) {
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const byId = new Map(entities.map((e) => [e.entity_id, e]));
  const needle = q.trim().toLowerCase();
  const LIMIT = 60;
  const matches = entities
    .filter((e) => !selected.includes(e.entity_id))
    .filter((e) => !needle || `${e.name} ${e.entity_id}`.toLowerCase().includes(needle));
  const results = matches.slice(0, LIMIT);

  return (
    <div className="entity-picker">
      {selected.length > 0 && (
        <div className="chips">
          {selected.map((id) => (
            <span key={id} className="chip on picked" title={id}>
              {byId.get(id)?.name ?? labelFor?.(id) ?? id}
              <button onClick={() => onChange(selected.filter((x) => x !== id))} aria-label={t('Remove {name}', { name: byId.get(id)?.name ?? id })}>
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="picker-box">
        <label className="search-box">
          <Search size={18} />
          <input
            placeholder={placeholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setTimeout(() => setFocus(false), 150)}
          />
        </label>
        {(focus || needle) && (
          <div className="picker-results">
            {results.map((e) => (
              <button
                key={e.entity_id}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => {
                  onChange([...selected, e.entity_id]);
                  setQ('');
                }}
              >
                <b>{e.name}</b>
                <span className="muted small">{e.entity_id}</span>
              </button>
            ))}
            {results.length === 0 && <p className="muted small">{t('No matches')}</p>}
            {matches.length > LIMIT && <p className="muted small">{t('{n} more. Type to narrow it down.', { n: matches.length - LIMIT })}</p>}
          </div>
        )}
      </div>
      {selected.length === 0 && emptyHint && <p className="muted small">{emptyHint}</p>}
    </div>
  );
}
