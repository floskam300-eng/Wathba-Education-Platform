import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Data is considered fresh for 15 minutes — no refetch while fresh
      staleTime: 15 * 60 * 1000,
      // Keep unused cache entries for 2 hours before garbage-collecting
      gcTime: 2 * 60 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

// Persist the cache to localStorage so revisiting a page doesn't hit the server
const localStoragePersister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'WATHBA_QUERY_CACHE',
  // Throttle writes to avoid hammering localStorage on rapid navigation
  throttleTime: 1000,
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: localStoragePersister,
        // Discard cached data older than 24 hours on next load
        maxAge: 24 * 60 * 60 * 1000,
      }}
    >
      <BrowserRouter>
        <App />
        <Toaster
          position="top-center"
          toastOptions={{
            style: { fontFamily: 'Cairo, sans-serif', direction: 'rtl' },
            success: { style: { background: '#1A2E4A', color: '#fff' } },
            error: { style: { background: '#ba1a1a', color: '#fff' } },
          }}
        />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </React.StrictMode>
);
