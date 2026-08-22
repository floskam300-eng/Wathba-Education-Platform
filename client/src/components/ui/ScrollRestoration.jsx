import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * ScrollRestoration — platform-wide scroll memory.
 *
 * Problem it solves: pages here scroll inside layout containers
 * (<main class="flex-1 overflow-y-auto"> persists across child-route swaps),
 * and data loads asynchronously. Without help, going back to a page lands you
 * either at the top or at a stale offset.
 *
 * How it works:
 * - While the user scrolls, positions of every visible scrollable container
 *   (window + overflow-y-auto/scroll elements, in stable DOM order) are kept
 *   in memory keyed by "pathname+search".
 * - On navigation away, the leaving page's positions are flushed to
 *   sessionStorage (also flushed on tab hide/unload for mobile back gestures).
 * - On BACK/FORWARD (and refresh) to a known page, a retry loop restores the
 *   positions — retrying until async content has grown the page enough.
 * - On normal forward navigation, everything resets to the top.
 */
const STORAGE_KEY = 'wathba_scroll_positions';
const MAX_ENTRIES = 80;
const RESTORE_TIMEOUT_MS = 3000;

function loadMap() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}

function saveMap(map) {
  try {
    const keys = Object.keys(map);
    if (keys.length > MAX_ENTRIES) {
      keys.slice(0, keys.length - MAX_ENTRIES).forEach(k => delete map[k]);
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* storage unavailable */ }
}

// Collect visible scrollable containers in stable document order.
// `el === null` means the window/document itself.
function collectScrollers() {
  const scrollers = [];
  if (document.documentElement.scrollHeight > document.documentElement.clientHeight + 1) {
    scrollers.push({ el: null, top: window.scrollY });
  }
  const candidates = document.querySelectorAll(
    'main, [data-scroll-restore], [class*="overflow-y-auto"], [class*="overflow-auto"]'
  );
  for (const el of candidates) {
    if (!el.isConnected || scrollers.some(s => s.el === el)) continue;
    const cs = getComputedStyle(el);
    if (
      (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
      el.clientHeight > 0 &&
      el.scrollHeight > el.clientHeight + 1
    ) {
      scrollers.push({ el, top: el.scrollTop });
    }
  }
  return scrollers;
}

const snapshotTops = (scrollers) => scrollers.map(s => Math.round(s.top));

// Apply saved offsets. Returns true once every target was reached (or is
// unreachable because the page can't scroll that far anymore).
function applyTops(tops) {
  const scrollers = collectScrollers();
  let allReached = true;
  tops.forEach((target, i) => {
    if (i >= scrollers.length) {
      if (target > 0) allReached = false; // container not rendered yet — keep retrying
      return;
    }
    const s = scrollers[i];
    const current = s.el ? s.el.scrollTop : window.scrollY;
    if (Math.abs(current - target) < 2) return;
    const max = s.el
      ? s.el.scrollHeight - s.el.clientHeight
      : document.documentElement.scrollHeight - window.innerHeight;
    const clamped = Math.min(target, Math.max(0, max));
    if (s.el) s.el.scrollTop = clamped;
    else window.scrollTo(0, clamped);
    const reached = Math.abs((s.el ? s.el.scrollTop : window.scrollY) - clamped) < 2;
    if (!reached && clamped > 0) allReached = false;
  });
  return allReached;
}

function resetToTop() {
  window.scrollTo(0, 0);
  document.querySelectorAll('main, [data-scroll-restore]').forEach(el => { el.scrollTop = 0; });
}

export default function ScrollRestoration() {
  const location = useLocation();
  const navType = useNavigationType();

  const keyRef = useRef(null);  // page key we're currently on
  const topsRef = useRef({});   // page key -> latest tops snapshot

  // Continuously remember scroll positions for the current page.
  useEffect(() => {
    let ticking = false;
    const record = () => {
      ticking = false;
      const key = keyRef.current;
      if (!key || !document.body) return;
      try { topsRef.current[key] = snapshotTops(collectScrollers()); } catch { /* ignore */ }
    };
    const onScroll = () => {
      if (!ticking) { ticking = true; requestAnimationFrame(record); }
    };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  const pathname = location.pathname;
  const search = location.search;

  // On page change: flush old positions, then restore (back/forward), reset
  // (new route), or do nothing (query-param tweak on the same route).
  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    const prevKey = keyRef.current;
    const nextKey = pathname + search;

    if (prevKey && prevKey !== nextKey && topsRef.current[prevKey]) {
      const map = loadMap();
      map[prevKey] = topsRef.current[prevKey];
      saveMap(map);
    }
    keyRef.current = nextKey;

    // Same route, different query string (filter typed, tab/rec selected,
    // page changed…): leave the scroll position exactly where it is.
    // Resetting here would yank the user to the top on every keystroke
    // because url-state updates replace the query string as you interact.
    const sameRoute = prevPathnameRef.current === pathname;
    prevPathnameRef.current = pathname;

    let cancelled = false;

    if (sameRoute) return () => { cancelled = true; };

    const saved = navType === 'POP' ? loadMap()[nextKey] : null;

    if (saved && saved.some(t => t > 0)) {
      const start = Date.now();
      const tick = () => {
        if (cancelled) return;
        if (applyTops(saved)) return;
        if (Date.now() - start < RESTORE_TIMEOUT_MS) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } else {
      requestAnimationFrame(() => { if (!cancelled) resetToTop(); });
    }

    return () => { cancelled = true; };
  }, [pathname, search, navType]);

  // Flush on hide/unload so mobile back-swipes and refreshes don't lose state.
  useEffect(() => {
    const flush = () => {
      const key = keyRef.current;
      if (!key || !topsRef.current[key]) return;
      const map = loadMap();
      map[key] = topsRef.current[key];
      saveMap(map);
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
