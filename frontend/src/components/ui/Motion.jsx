import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Counts from 0 to `value` once on mount (and tweens when the value changes). */
export function AnimatedNumber({ value, format = (n) => String(Math.round(n)), duration = 800 }) {
  const [shown, setShown] = useState(prefersReducedMotion() ? value : 0);
  const from = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) { setShown(value); return undefined; }
    const start = performance.now();
    const origin = from.current;
    let raf;
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      const current = origin + (value - origin) * eased;
      setShown(current);
      from.current = current;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{format(shown)}</>;
}

/** Fades + lifts its children in; stagger siblings with `delay` (ms). */
export function Rise({ children, delay = 0, className = '', as: Tag = 'div' }) {
  return <Tag className={`animate-rise ${className}`} style={{ animationDelay: `${delay}ms` }}>{children}</Tag>;
}

/** Pure-CSS 3D stack of crates (2x2 base + 1 on top) that slowly rotates and floats. */
export function CrateStack() {
  // [x, y, z] offsets in px relative to the stack centre (y negative = up)
  const crates = [[-30, 29, -30], [30, 29, -30], [-30, 29, 30], [30, 29, 30], [0, -29, 0]];
  return (
    <div className="scene relative mx-auto h-64 w-64">
      <div className="float absolute inset-0 flex items-center justify-center">
        <div className="stack" aria-hidden="true">
          {crates.map(([x, y, z]) => (
            <div key={`${x}${y}${z}`} className="crate" style={{ left: 47, top: 47, transform: `translate3d(${x}px, ${y}px, ${z}px)` }}>
              {[0, 1, 2, 3, 4, 5].map((f) => <i key={f} />)}
            </div>
          ))}
        </div>
      </div>
      <div className="ground-shadow absolute bottom-4 left-1/2 h-4 w-32 -translate-x-1/2 rounded-full bg-black blur-md" />
    </div>
  );
}
