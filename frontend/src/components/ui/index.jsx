import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatedNumber } from './Motion.jsx';
import { Loader2, Search, ChevronLeft, ChevronRight, Inbox, AlertTriangle, X } from 'lucide-react';
import { STATUS_TONE, STOCK_STATUS_LABEL } from '../../utils/format.js';

const DOT = { gray: 'bg-zinc-400', green: 'bg-emerald-500', blue: 'bg-blue-500', indigo: 'bg-indigo-500', amber: 'bg-amber-500', red: 'bg-red-500' };
const CHIP = {
  gray: 'bg-zinc-100 text-zinc-700',
  green: 'bg-emerald-50 text-emerald-800',
  blue: 'bg-blue-50 text-blue-800',
  indigo: 'bg-indigo-50 text-indigo-800',
  amber: 'bg-amber-50 text-amber-800',
  red: 'bg-red-50 text-red-800',
};

/** Square tinted chip - used for roles / categories, not statuses. */
export function Badge({ children, tone = 'gray' }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${CHIP[tone]}`}>{children}</span>;
}

/** Status as a coloured dot + plain text: calmer than pills and easier to scan down a column. */
export function StatusBadge({ status }) {
  const tone = STATUS_TONE[status] || 'gray';
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] text-zinc-700">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />
      {STOCK_STATUS_LABEL[status] || status}
    </span>
  );
}

export function Spinner({ className = 'h-4 w-4' }) {
  return <Loader2 className={`animate-spin ${className}`} aria-label="Loading" />;
}

export function LoadingBlock({ label = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-zinc-500">
      <Spinner className="h-5 w-5" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title = 'No records found', hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <Inbox className="mb-3 h-8 w-8 text-zinc-300" />
      <p className="font-medium text-zinc-700">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-zinc-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <AlertTriangle className="mb-3 h-8 w-8 text-red-400" />
      <p className="font-medium text-zinc-700">Something went wrong</p>
      <p className="mt-1 max-w-md text-zinc-500">{message}</p>
      {onRetry && (
        <button className="btn-secondary mt-4" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold leading-7 tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-zinc-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'default' }) {
  return (
    <div className="card px-4 py-3">
      <p className="kicker">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${tone === 'warn' ? 'text-amber-700' : 'text-zinc-900'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

/** One bordered container with dividers instead of a grid of separate cards. items: [{label,value,hint,to,tone}] */
export function KpiStrip({ items, columns = 4 }) {
  const cols = { 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 xl:grid-cols-4' }[columns];
  return (
    <div className={`card grid grid-cols-1 divide-y divide-zinc-200 sm:divide-y-0 ${cols} ${columns === 4 ? 'xl:divide-x' : 'sm:divide-x'}`}>
      {items.map((i, idx) => {
        const body = (
          <>
            <p className="kicker">{i.label}</p>
            <p className={`mt-1.5 text-[26px] font-semibold leading-none tabular-nums tracking-tight ${i.tone === 'warn' ? 'text-amber-700' : 'text-zinc-900'}`}>{i.number !== undefined ? <AnimatedNumber value={i.number} format={i.format} /> : i.value}</p>
            {i.hint && <p className="mt-1.5 truncate text-xs text-zinc-500">{i.hint}</p>}
          </>
        );
        return i.to ? (
          <Link key={i.label} to={i.to} style={{ animationDelay: `${idx * 60}ms` }} className="animate-rise block px-5 py-4 transition-colors hover:bg-zinc-50">{body}</Link>
        ) : (
          <div key={i.label} style={{ animationDelay: `${idx * 60}ms` }} className="animate-rise px-5 py-4">{body}</div>
        );
      })}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search...', className = '' }) {
  const [local, setLocal] = useState(value || '');
  useEffect(() => setLocal(value || ''), [value]);
  useEffect(() => {
    if (local === (value || '')) return undefined;
    const t = setTimeout(() => onChange(local), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      <input className="input pl-9 pr-8" value={local} onChange={(e) => setLocal(e.target.value)} placeholder={placeholder} aria-label="Search" />
      {local && (
        <button className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600" onClick={() => { setLocal(''); onChange(''); }} aria-label="Clear search">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options, placeholder = 'All' }) {
  return (
    <select className="input w-auto min-w-[9rem]" value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label={label} title={label}>
      <option value="">{`${placeholder} ${label.toLowerCase()}`}</option>
      {options.map((o) => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o;
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}

export function Pagination({ pagination, onPage }) {
  if (!pagination || pagination.total === 0) return null;
  const { page, limit, total, totalPages } = pagination;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const pages = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  for (let p = start; p <= Math.min(totalPages, start + 4); p += 1) pages.push(p);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500">
      <span>
        Showing <b className="text-zinc-700">{from}</b>-<b className="text-zinc-700">{to}</b> of <b className="text-zinc-700">{total}</b>
      </span>
      <div className="flex items-center gap-1">
        <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pages.map((p) => (
          <button key={p} onClick={() => onPage(p)} className={`btn btn-sm min-w-[2rem] ${p === page ? 'bg-zinc-900 text-surface' : 'border border-zinc-300 bg-surface text-zinc-700 hover:bg-zinc-50'}`}>
            {p}
          </button>
        ))}
        <button className="btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-zinc-200">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
            value === t.value ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function DetailGrid({ items }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="kicker">{label}</dt>
          <dd className="mt-0.5 break-words text-zinc-800">{value === undefined || value === null || value === '' ? '-' : value}</dd>
        </div>
      ))}
    </dl>
  );
}
