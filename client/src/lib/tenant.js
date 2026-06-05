/**
 * Returns the current teacher slug from:
 * 1. Subdomain in production (mr-ahmed.wathba.site → "mr-ahmed")
 * 2. localStorage fallback in dev (localhost / Replit preview)
 */
export function getTenantSlug() {
  const hostname = window.location.hostname;
  const parts = hostname.split('.');
  const isDevHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.includes('.replit.dev') ||
    hostname.includes('.replit.app') ||
    hostname.includes('.repl.co') ||
    parts.length < 3;

  if (!isDevHost && parts[0] !== 'www') {
    return parts[0];
  }

  return localStorage.getItem('wathba_teacher_slug') || null;
}

export function isMainDomain() {
  return getTenantSlug() === null;
}
