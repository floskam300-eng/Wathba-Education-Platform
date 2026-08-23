/**
 * One-shot cache self-heal for stale module graphs.
 *
 * WebKit (iOS/macOS, including WhatsApp/Instagram in-app WebViews) sometimes
 * keeps serving a mix of chunks from different deploy generations after a
 * release, producing fatal errors like:
 *   • "Importing binding name 'x' is not found"
 *   • "Importing a module script failed"
 *   • "Failed to fetch dynamically imported module"
 *
 * Affected students used to be stuck on the error screen (in-app WebViews have
 * no hard-refresh affordance). This helper purges our Cache-API storage and
 * reloads once per tab session so the app boots from a clean generation.
 */
const HEAL_FLAG = 'wathba_selfheal_at';

export function isModuleLoadError(err) {
  const msg = String((err && err.message) || err || '');
  return /Importing binding name|Importing a module script failed|dynamically imported module|Failed to fetch dynamically|error loading dynamically imported/i.test(msg);
}

export async function selfHealAndReload() {
  try {
    if (sessionStorage.getItem(HEAL_FLAG)) return false;
    sessionStorage.setItem(HEAL_FLAG, String(Date.now()));
  } catch (_) {
    // Storage unavailable — still attempt a single reload below.
  }
  try {
    if (window.caches && typeof caches.keys === 'function') {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => k.startsWith('wathba-')).map(k => caches.delete(k))
      );
    }
  } catch (_) {}
  window.location.reload();
  return true;
}
