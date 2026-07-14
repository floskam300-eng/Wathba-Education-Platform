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

  // 'api' subdomain is the backend — not a tenant slug
  const NON_TENANT_SUBDOMAINS = ['www', 'api'];

  if (!isDevHost && !NON_TENANT_SUBDOMAINS.includes(parts[0])) {
    return parts[0];
  }

  // Dev convenience: ?tenant=slug in the URL persists to localStorage so the
  // Replit preview (which has no real subdomain) can be pointed at a tenant.
  // ?tenant= (empty) clears it, to get back to the main-domain SaaS pages.
  if (isDevHost) {
    const params = new URLSearchParams(window.location.search);
    if (params.has('tenant')) {
      const urlTenant = params.get('tenant');
      if (urlTenant) {
        localStorage.setItem('wathba_teacher_slug', urlTenant);
        return urlTenant;
      }
      localStorage.removeItem('wathba_teacher_slug');
      return null;
    }
  }

  // Order of priority: localStorage (user-set) → build-time default → null
  return (
    localStorage.getItem('wathba_teacher_slug') ||
    import.meta.env.VITE_DEFAULT_TENANT_SLUG ||
    null
  );
}

export function isMainDomain() {
  return getTenantSlug() === null;
}
