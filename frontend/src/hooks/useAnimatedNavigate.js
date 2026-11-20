import { useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * navigate() wrapped in the browser View Transitions API so pages cross-fade/slide
 * (see ::view-transition-* rules in index.css). Falls back to a plain navigate.
 */
export function useAnimatedNavigate() {
  const navigate = useNavigate();
  return useCallback(
    (to, options) => {
      if (typeof document.startViewTransition !== 'function' || reduced()) return navigate(to, options);
      document.startViewTransition(() => flushSync(() => navigate(to, options)));
      return undefined;
    },
    [navigate]
  );
}
