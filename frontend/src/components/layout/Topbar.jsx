import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, LogOut, Menu, Palette, PanelLeftClose, PanelLeftOpen, Search, User as UserIcon } from 'lucide-react';
import { useTheme, THEMES } from '../../context/ThemeContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { inventoryApi } from '../../api/index.js';
import { ROUTE_TITLES } from './navigation.js';

function useClickOutside(ref, onOutside) {
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && onOutside();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOutside]);
}

function Breadcrumbs() {
  const { pathname } = useLocation();
  const parts = pathname.split('/').filter(Boolean);
  const base = `/${parts[0] || ''}`;
  const section = ROUTE_TITLES[parts.length ? base : '/'] || 'StockFlow';
  const sub = parts[1] === 'new' ? 'New' : parts[2] === 'edit' ? 'Edit' : parts[1] ? 'Details' : null;

  return (
    <nav className="flex min-w-0 items-center gap-1.5 text-sm" aria-label="Breadcrumb">
      <Link to="/" className="hidden text-zinc-500 hover:text-zinc-800 sm:inline">StockFlow</Link>
      <ChevronRight className="hidden h-3.5 w-3.5 text-zinc-300 sm:block" />
      {sub ? (
        <>
          <Link to={base} className="truncate text-zinc-500 hover:text-zinc-800">{section}</Link>
          <ChevronRight className="h-3.5 w-3.5 text-zinc-300" />
          <span className="font-medium text-zinc-900">{sub}</span>
        </>
      ) : (
        <span className="truncate font-medium text-zinc-900">{section}</span>
      )}
    </nav>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      inventoryApi
        .list({ lowStock: true, limit: 6, sortBy: 'availableQuantity', order: 'asc' })
        .then((r) => {
          if (cancelled) return;
          setItems(r.data);
          setTotal(r.pagination.total);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 120000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-md p-2 text-zinc-500 hover:bg-zinc-100" aria-label={`Notifications (${total} low stock alerts)`}>
        <Bell className="h-4.5 w-4.5" />
        {total > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">{total > 99 ? '99+' : total}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-lg border border-zinc-200 bg-surface shadow-pop">
          <div className="border-b border-zinc-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Low stock alerts</div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-zinc-500">All stock levels are healthy.</p>
          ) : (
            <ul className="max-h-72 divide-y divide-zinc-100 overflow-y-auto">
              {items.map((r) => (
                <li key={r._id} className="px-4 py-2.5">
                  <p className="truncate font-medium text-zinc-800">{r.product.productName}</p>
                  <p className="text-xs text-zinc-500">
                    {r.warehouse.warehouseName} &middot; <span className="text-amber-700">{r.availableQuantity} available</span> (reorder at {r.product.reorderLevel})
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link to="/inventory?lowStock=true" onClick={() => setOpen(false)} className="block border-t border-zinc-100 px-4 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-zinc-50">
            View all low stock
          </Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  useClickOutside(ref, () => setOpen(false));
  const initials = user.name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-md p-1 pr-2 hover:bg-zinc-100" aria-label="User menu">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-medium text-surface">{initials}</span>
        <span className="hidden text-left sm:block">
          <span className="block text-xs font-medium leading-tight text-zinc-800">{user.name}</span>
          <span className="block text-[11px] leading-tight text-zinc-500">{user.role}</span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 rounded-lg border border-zinc-200 bg-surface py-1 shadow-pop">
          <div className="border-b border-zinc-100 px-4 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-zinc-500">{user.email}</p>
          </div>
          <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50" onClick={() => { setOpen(false); navigate('/settings'); }}>
            <UserIcon className="h-4 w-4" /> Profile &amp; password
          </button>
          <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50" onClick={logout}>
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Topbar({ onOpenMobile, onToggleSidebar, sidebarOpen }) {
  const navigate = useNavigate();
  const { theme, cycle } = useTheme();
  const [q, setQ] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/products?search=${encodeURIComponent(term)}` : '/products');
    setQ('');
  };

  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-zinc-200 bg-surface px-4 lg:px-6">
      <button className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 lg:hidden" onClick={onOpenMobile} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <button className="hidden rounded-md p-2 text-zinc-500 hover:bg-zinc-100 lg:inline-flex" onClick={onToggleSidebar} aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'} title={sidebarOpen ? 'Hide sidebar ( [ )' : 'Show sidebar ( [ )'}>
        {sidebarOpen ? <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.75} />}
      </button>
      <Breadcrumbs />
      <div className="flex-1" />
      <form onSubmit={submit} className="relative hidden w-72 md:block" role="search">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input className="input bg-zinc-50 pl-9 pr-3 hover:bg-surface" placeholder="Search products by name or SKU" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Global product search" />
      </form>
      <button className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100" onClick={cycle} aria-label={`Theme: ${THEMES[theme].label}. Click to switch`} title={`Theme: ${THEMES[theme].label} (click to switch)`}>
        <Palette className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </button>
      <Notifications />
      <UserMenu />
    </header>
  );
}
