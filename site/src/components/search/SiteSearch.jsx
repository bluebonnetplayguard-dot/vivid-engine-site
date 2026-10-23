import { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { SEARCH_ITEMS, SEARCH_TYPES } from '@/data/searchIndex';

const TYPE_STYLES = {
  Service: 'text-primary',
  Pricing: 'text-emerald-400',
  FAQ: 'text-sky-400',
  Page: 'text-muted-foreground',
};

export default function SiteSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeType, setActiveType] = useState('All');
  const containerRef = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matches = SEARCH_ITEMS.filter(item => {
      const haystack = `${item.title} ${item.description} ${item.keywords}`.toLowerCase();
      return haystack.includes(q);
    });
    const filtered = activeType === 'All' ? matches : matches.filter(r => r.type === activeType);
    return filtered.slice(0, 12);
  }, [query, activeType]);

  const counts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return {};
    const map = {};
    SEARCH_ITEMS.forEach(item => {
      const haystack = `${item.title} ${item.description} ${item.keywords}`.toLowerCase();
      if (haystack.includes(q)) map[item.type] = (map[item.type] || 0) + 1;
    });
    return map;
  }, [query]);

  useEffect(() => {
    const onClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const clear = () => { setQuery(''); setOpen(false); };

  return (
    <div ref={containerRef} className="relative mx-auto max-w-2xl px-4 py-8">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveType('All'); }}
          onFocus={() => setOpen(true)}
          placeholder="Search services, pricing, FAQs…"
          aria-label="Search site content"
          className="h-12 w-full rounded-full border border-border bg-card pl-12 pr-12 text-sm text-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        />
        {query && (
          <button type="button" onClick={clear} aria-label="Clear search" className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && query.trim() && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
          <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
            {['All', ...SEARCH_TYPES].map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setActiveType(type)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${activeType === type ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
              >
                {type}{type !== 'All' && counts[type] ? ` (${counts[type]})` : ''}
              </button>
            ))}
          </div>

          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No results for "{query}". Try "website", "pricing", or "domain".</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {results.map((item, i) => (
                <li key={i}>
                  <Link to={item.path} onClick={clear} className="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-b-0 hover:bg-accent">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold uppercase tracking-wide ${TYPE_STYLES[item.type] || 'text-muted-foreground'}`}>{item.type}</span>
                      <span className="text-sm font-medium text-foreground">{item.title}</span>
                    </div>
                    {item.description && <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}