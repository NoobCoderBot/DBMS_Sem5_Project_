import { Suspense, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import { LoadingBlock } from '../ui/index.jsx';

const KEY = 'stockflow_sidebar';

export default function AppLayout() {
  // the sidebar is simply shown or hidden (remembered between visits); older "collapsed" values count as shown
  const [open, setOpen] = useState(() => localStorage.getItem(KEY) !== 'hidden');
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  const toggle = useCallback(() => {
    setOpen((o) => {
      localStorage.setItem(KEY, o ? 'hidden' : 'shown');
      return !o;
    });
  }, []);

  // "[" toggles the sidebar unless the user is typing
  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      const typing = el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      if (e.key === '[' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  return (
    <div className="min-h-screen">
      <Sidebar open={open} onHide={toggle} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className={`transition-[padding] duration-200 ease-out ${open ? 'lg:pl-56' : 'lg:pl-0'}`}>
        <Topbar sidebarOpen={open} onToggleSidebar={toggle} onOpenMobile={() => setMobileOpen(true)} />
        <main className="mx-auto max-w-[1400px] p-4 lg:p-6">
          <Suspense fallback={<LoadingBlock />}>
            <div key={pathname} className="vt-main animate-rise">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
