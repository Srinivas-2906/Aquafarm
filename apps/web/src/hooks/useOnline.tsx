import { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function ConnectivityBanner() {
  const online = useOnline();
  const { t } = useTranslation();

  if (online) return null;

  return (
    <div className="bg-offline text-white px-4 py-2 flex items-center gap-2 text-sm font-medium">
      <WifiOff size={18} />
      <span>{t('common.offline')}</span>
    </div>
  );
}

export function ConnectivityIndicator() {
  const online = useOnline();
  const { t } = useTranslation();

  return (
    <div className={`flex items-center gap-1 text-sm ${online ? 'text-success' : 'text-offline'}`}>
      {online ? <Wifi size={16} /> : <WifiOff size={16} />}
      <span>{online ? t('common.online') : t('common.offline')}</span>
    </div>
  );
}
