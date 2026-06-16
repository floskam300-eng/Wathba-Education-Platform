import { useState, useEffect } from 'react';
import { WifiOff, X } from 'lucide-react';

export default function OfflineIndicator() {
  const [visible, setVisible] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const handleOffline = () => {
      setMsg('لا يوجد اتصال بالإنترنت');
      setVisible(true);
    };
    const handleOnline = () => {
      setMsg('عاد الاتصال بالإنترنت ✓');
      setTimeout(() => setVisible(false), 2500);
    };
    const handleNetworkError = (e) => {
      setMsg(e.detail?.message || 'تعذّر الاتصال بالخادم، تحقق من الإنترنت');
      setVisible(true);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('wathba_network_error', handleNetworkError);

    if (!navigator.onLine) {
      setMsg('لا يوجد اتصال بالإنترنت');
      setVisible(true);
    }

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('wathba_network_error', handleNetworkError);
    };
  }, []);

  if (!visible) return null;

  const isBack = msg.includes('✓');

  return (
    <div
      className={`fixed bottom-4 right-4 left-4 sm:left-auto sm:w-80 z-[9999] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl transition-all duration-300 ${
        isBack
          ? 'bg-green-600 text-white'
          : 'bg-gray-900 text-white'
      }`}
      dir="rtl"
    >
      <WifiOff className={`w-4 h-4 flex-shrink-0 ${isBack ? 'hidden' : ''}`} />
      <p className="text-sm font-bold flex-1">{msg}</p>
      <button
        onClick={() => setVisible(false)}
        className="p-1 rounded-lg hover:bg-white/20 transition-colors flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
