import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom 25 does not implement the localStorage API by default (only
// sessionStorage). Polyfill it with an in-memory Map-backed implementation
// so libraries that read/write `localStorage` work in tests.
class MemoryStorage {
  constructor() { this._m = new Map(); }
  get length() { return this._m.size; }
  key(i) { return Array.from(this._m.keys())[i] ?? null; }
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }
  setItem(k, v) { this._m.set(String(k), String(v)); }
  removeItem(k) { this._m.delete(k); }
  clear() { this._m.clear(); }
}

if (typeof globalThis.localStorage === 'undefined') {
  const store = new MemoryStorage();
  globalThis.localStorage = store;
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { get: () => store, configurable: true });
  }
}

afterEach(() => {
  cleanup();
  try { localStorage.clear(); } catch (_) {}
  try { sessionStorage.clear(); } catch (_) {}
});
