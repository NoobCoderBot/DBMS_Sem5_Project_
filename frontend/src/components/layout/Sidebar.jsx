import { Fragment } from 'react';
import { NavLink } from 'react-router-dom';
import { PanelLeftClose, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAnimatedNavigate } from '../../hooks/useAnimatedNavigate.js';
import { NAV_ITEMS } from './navigation.js';

export function Mark({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#f4f4f5" />
      <path d="M8 12.5 16 8l8 4.5v7L16 24l-8-4.5z" fill="none" stroke="#111418" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 12.5 16 17l8-4.5M16 17v7" fill="none" stroke="#111418" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

// The sidebar is dark in every theme, so it uses fixed `neutral` shades rather than the themable zinc scale.
export function Logo({ dark = true }) {
  return (
    <div className="flex items-center gap-2.5">
      <Mark className="h-6 w-6 shrink-0" />
      <span className={`text-[15px] font-semibold tracking-tight ${dark ? 'text-white' : 'text-zinc-900'}`}>StockFlow</span>
    </div>
  );
}

function Panel({ onHide, onCloseMobile, isMobile }) {
  const { user, hasRole } = useAuth();
  const go = useAnimatedNavigate();
  const items = NAV_ITEMS.filter((n) => hasRole(...n.roles));
  let lastGroup;

  return (
    <div className="flex h-full flex-col bg-ink-900 text-neutral-300">
      <div className="flex h-12 shrink-0 items-center justify-between px-4">
        <Logo />
        {isMobile && (
          <button onClick={onCloseMobile} className="rounded p-1 text-neutral-400 hover:bg-white/10" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label="Main navigation">
        {items.map(({ to, label, icon: Icon, end, group }) => {
          const showGroup = group && group !== lastGroup;
          lastGroup = group;
          return (
            <Fragment key={to}>
              {showGroup && <p className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-neutral-500">{group}</p>}
              <NavLink
                to={to}
                end={end}
                onClick={(e) => {
                  onCloseMobile?.();
                  // plain left-click only: let ctrl/cmd/middle-click open new tabs normally
                  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  go(to);
                }}
                className={({ isActive }) =>
                  `group relative my-px flex h-8 items-center gap-2.5 rounded-md px-3 text-[13px] transition-colors ${
                    isActive ? 'bg-white/10 font-medium text-white' : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-100'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute -left-2 top-1.5 h-5 w-0.5 rounded-r bg-white" />}
                    <Icon className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-110" strokeWidth={1.75} />
                    <span className="truncate">{label}</span>
                  </>
                )}
              </NavLink>
            </Fragment>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-2">
        {user && (
          <div className="px-3 py-2">
            <p className="truncate text-xs font-medium text-neutral-200">{user.name}</p>
            <p className="truncate text-xs text-neutral-500">{user.role}</p>
          </div>
        )}
        {!isMobile && (
          <button onClick={onHide} className="flex h-8 w-full items-center gap-2.5 rounded-md px-3 text-[13px] text-neutral-500 hover:bg-white/5 hover:text-neutral-200" title="Hide sidebar ( [ )">
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
            <span>Hide sidebar</span>
            <kbd className="ml-auto rounded border border-white/15 px-1 text-[10px] text-neutral-500">[</kbd>
          </button>
        )}
      </div>
    </div>
  );
}

/** Desktop: slides fully out of view when hidden. Mobile: slide-over drawer. */
export default function Sidebar({ open, onHide, mobileOpen, onCloseMobile }) {
  return (
    <>
      <aside
        aria-hidden={!open}
        className={`fixed inset-y-0 left-0 z-30 hidden w-56 transition-transform duration-200 ease-out lg:block ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Panel onHide={onHide} />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="animate-fade absolute inset-0 bg-black/50" onClick={onCloseMobile} />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-pop">
            <Panel isMobile onCloseMobile={onCloseMobile} />
          </aside>
        </div>
      )}
    </>
  );
}
