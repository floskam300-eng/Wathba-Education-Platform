import { useCallback, useRef } from 'react';
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
 *
 * ── Cross-instance batching (important!) ────────────────────────────────────
 * React Router's setSearchParams does NOT batch: every call issues its own
 * navigate() computed from the searchParams captured during the current
 * render. When several url-state setters run in one handler — e.g.
 * "change course + reset all filters", or "set filter + go to page 1" — each
 * call would overwrite the previous one and every call would be computed
 * from the stale pre-handler URL, silently dropping updates.
 *
 * Fix: patches are queued module-wide and flushed in ONE navigation per tick
 * (microtask), applied sequentially onto an evolving URLSearchParams so
 * functional updates compose exactly like useState.
 */
let pendingPatches = [];
let flushScheduled = false;

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    const patches = pendingPatches;
    pendingPatches = [];
    if (!patches.length) return;

    // Start from the URL as it was before this tick, then apply every patch
    // in order so sequential/functional updates compose like useState.
    const acc = new URLSearchParams(patches[0].base());
    for (const p of patches) {
      const rawCurrent = acc.get(p.key);
      const current = rawCurrent === null ? p.initialValue : p.parse(rawCurrent);
      const resolved = typeof p.next === 'function' ? p.next(current) : p.next;
      if (
        resolved === null ||
        resolved === undefined ||
        resolved === '' ||
        resolved === p.initialValue
      ) {
        acc.delete(p.key);
      } else {
        acc.set(p.key, p.serialize(resolved));
      }
    }

    // One navigation for the whole tick (replace unless any patch asked push).
    const replace = patches.every(p => p.replace);
    try {
      patches[0].commit(acc, { replace });
    } catch {
      /* router unavailable (unmounted mid-tick) — nothing to do */
    }
  });
}

export default function useUrlState(key, initialValue, options = {}) {
  const {
    replace = true,
    serialize = (v) => String(v),
    parse = (v) => v,
  } = options;

  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(key);
  const value = raw === null ? initialValue : parse(raw);

  // Always-fresh ref so a queued patch reads/commits against the latest
  // rendered location even when the flush runs after several setter calls.
  const latest = useRef({});
  latest.current.searchParams = searchParams;
  latest.current.setSearchParams = setSearchParams;

  const setValue = useCallback((next) => {
    pendingPatches.push({
      key,
      initialValue,
      parse,
      serialize,
      replace,
      next,
      base: () => latest.current.searchParams,
      commit: (params, navOpts) => latest.current.setSearchParams(params, navOpts),
    });
    scheduleFlush();
  }, [key, initialValue, parse, serialize, replace]);

  return [value, setValue];
}
