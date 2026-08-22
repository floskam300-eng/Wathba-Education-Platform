import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * useUrlState — like useState, but the value lives in the URL query string.
 *
 * This makes filters / tabs / page numbers survive back/forward navigation,
 * page refreshes, and link sharing. When the user navigates away and presses
 * "back", the URL (and therefore the state) is restored exactly as they left it.
 *
 * Usage:
 *   const [stageFilter, setStageFilter] = useUrlState('stage', 'الكل');
 *   const [page, setPage] = useUrlState('page', 1, { parse: Number });
 *
 * Notes:
 * - When the value equals the initial value the param is removed from the URL,
 *   keeping URLs clean.
 * - Uses `replace: true` by default so changing a filter doesn't pollute the
 *   browser history — pressing "back" leaves the page, as users expect.
 */
export default function useUrlState(key, initialValue, options = {}) {
  const {
    replace = true,
    serialize = (v) => String(v),
    parse = (v) => v,
  } = options;

  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(key);
  const value = raw === null ? initialValue : parse(raw);

  const setValue = useCallback((next) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      const current = p.get(key);
      const resolved =
        typeof next === 'function'
          ? next(current === null ? initialValue : parse(current))
          : next;
      if (
        resolved === null ||
        resolved === undefined ||
        resolved === '' ||
        resolved === initialValue
      ) {
        if (current !== null) p.delete(key);
      } else {
        const serialized = serialize(resolved);
        if (serialized !== current) p.set(key, serialized);
      }
      return p;
    }, { replace });
  }, [key, initialValue, parse, serialize, replace, setSearchParams]);

  return [value, setValue];
}
