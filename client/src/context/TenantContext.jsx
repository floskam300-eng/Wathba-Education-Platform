import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(null);
  const [tenantLoading, setTenantLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/public/tenant')
      .then(r => setTenant(r.data.tenant || null))
      .catch(() => setTenant(null))
      .finally(() => setTenantLoading(false));
  }, []);

  return (
    <TenantContext.Provider value={{ tenant, tenantLoading }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}

/** Returns the platform name: teacher's custom name or fallback "وثبة" */
export function usePlatformName() {
  const { tenant } = useTenant();
  return tenant?.platform_name || tenant?.name || 'وثبة';
}

/** Returns the logo URL or null (fallback to wathba logo handled in component) */
export function usePlatformLogo() {
  const { tenant } = useTenant();
  return tenant?.logo_url || null;
}

/** Returns the primary color for the platform */
export function usePrimaryColor() {
  const { tenant } = useTenant();
  return tenant?.primary_color || '#f97316';
}
