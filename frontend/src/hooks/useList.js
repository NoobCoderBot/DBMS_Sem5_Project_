import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseError } from '../api/client.js';

const clean = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null && v !== false));

/**
 * Server-driven list state: search, filters, sorting and pagination all go to the API.
 * `fetcher(params)` must resolve to the raw API body ({ data, pagination, ...extra }).
 */
export function useList(fetcher, initial = {}) {
  const [params, setParams] = useState({ page: 1, limit: 10, ...initial });
  const [state, setState] = useState({ rows: [], pagination: null, extra: null, loading: true, error: null });
  const [version, setVersion] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const key = JSON.stringify(params);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcherRef
      .current(clean(params))
      .then((body) => {
        if (cancelled) return;
        setState({ rows: body.data, pagination: body.pagination || null, extra: body, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: parseError(err).message }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const setParam = useCallback((name, value) => setParams((p) => ({ ...p, [name]: value, page: 1 })), []);
  const setPage = useCallback((page) => setParams((p) => ({ ...p, page })), []);
  const setSort = useCallback(
    (sortBy) =>
      setParams((p) => ({ ...p, sortBy, order: p.sortBy === sortBy && p.order === 'asc' ? 'desc' : 'asc', page: 1 })),
    []
  );
  // reset(keep): clear all filters but retain fixed params such as { orderType }; click events are ignored
  const reset = useCallback((keep) => setParams({ page: 1, limit: 10, ...(keep && !keep.nativeEvent ? keep : {}) }), []);

  return useMemo(
    () => ({ ...state, params, setParam, setPage, setSort, refresh, reset, sort: { sortBy: params.sortBy, order: params.order } }),
    [state, params, setParam, setPage, setSort, refresh, reset]
  );
}

/** Loads a single async value once (and when `deps` change). */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [version, setVersion] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    loaderRef
      .current()
      .then((data) => !cancelled && setState({ data, loading: false, error: null }))
      .catch((err) => !cancelled && setState({ data: null, loading: false, error: parseError(err).message }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  return { ...state, reload: useCallback(() => setVersion((v) => v + 1), []) };
}
