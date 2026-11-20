import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { productsApi } from '../../api/index.js';
import { Spinner } from '../ui/index.jsx';

/** Async type-ahead for active products (server-side search, never loads the whole catalogue). */
export default function ProductPicker({ value, onChange, error, disabled, excludeIds = [] }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      productsApi
        .list({ search: query, limit: 8, status: 'Active', sortBy: 'productName', order: 'asc' })
        .then((r) => !cancelled && setResults(r.data))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  if (value) {
    return (
      <div className={`input flex items-center justify-between gap-2 ${disabled ? 'bg-zinc-100' : ''}`}>
        <span className="truncate">
          <span className="font-medium text-zinc-900">{value.productName}</span> <span className="text-xs text-zinc-500">{value.SKU}</span>
        </span>
        {!disabled && (
          <button type="button" onClick={() => onChange(null)} className="text-zinc-400 hover:text-zinc-600" aria-label="Clear product">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      <input
        className={`input pl-9 ${error ? 'input-error' : ''}`}
        placeholder="Search product by name or SKU"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        aria-label="Product"
        autoComplete="off"
      />
      {open && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full min-w-[18rem] overflow-y-auto rounded-md border border-zinc-200 bg-surface py-1 shadow-pop">
          {loading && <li className="flex items-center gap-2 px-3 py-2 text-zinc-500"><Spinner /> Searching...</li>}
          {!loading && results.length === 0 && <li className="px-3 py-2 text-zinc-500">No active products match.</li>}
          {!loading &&
            results.map((p) => {
              const taken = excludeIds.includes(p._id);
              return (
                <li key={p._id}>
                  <button
                    type="button"
                    disabled={taken}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => { onChange(p); setOpen(false); setQuery(''); }}
                  >
                    <span className="truncate"><span className="font-medium text-zinc-900">{p.productName}</span> <span className="text-xs text-zinc-500">{p.SKU}</span></span>
                    {taken && <span className="text-xs text-zinc-400">Already added</span>}
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
