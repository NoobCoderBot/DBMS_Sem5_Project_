import { Boxes, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { Logo } from '../../components/layout/Sidebar.jsx';
import { CrateStack, Rise } from '../../components/ui/Motion.jsx';

const POINTS = [
  { icon: Boxes, text: 'One view of stock across every warehouse, with reserved and available units kept apart.' },
  { icon: ClipboardCheck, text: 'Purchases, sales and transfers move inventory only when goods are received, shipped or delivered.' },
  { icon: ShieldCheck, text: 'Every stock change is written to an append-only ledger you can audit.' },
];

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-10 text-neutral-300 lg:flex">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "40px 40px", maskImage: "radial-gradient(circle at 50% 40%, #000, transparent 70%)", WebkitMaskImage: "radial-gradient(circle at 50% 40%, #000, transparent 70%)" }} />
        <Logo />
        <div className="max-w-md">
          <CrateStack />
          <h2 className="mt-4 text-[28px] font-semibold leading-9 tracking-tight text-white">Know exactly what you have, and where it is.</h2>
          <ul className="mt-8 space-y-5">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" strokeWidth={1.75} />
                <p className="text-sm leading-6 text-neutral-400">{text}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-neutral-600">Inventory &amp; warehouse management</p>
      </aside>

      <main className="flex items-center justify-center bg-surface px-6 py-10">
        <Rise className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo dark={false} /></div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mb-6 mt-1 text-neutral-500">{subtitle}</p>
          {children}
          {footer && <p className="mt-6 text-neutral-500">{footer}</p>}
        </Rise>
      </main>
    </div>
  );
}
