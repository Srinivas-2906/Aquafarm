import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Package, FileText } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { AddTankButton } from '@/components/AddTankButton';
import { TankRowList, pondStatusesToTankRows } from '@/components/TankRowList';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { syncPendingOperations, getPendingCount } from '@/lib/sync';
import { formatDate } from '@/lib/utils';
import type { PondTodayStatusDto } from '@aqualedger/contracts';
import { useState, useEffect } from 'react';

export function SupervisorHomePage() {
  const { t } = useTranslation();
  const { user, selectedFarmId } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const farm = user?.farms.find((f) => f.farmId === selectedFarmId);

  const { data: pondStatuses, refetch, isLoading } = useQuery({
    queryKey: ['pond-status', selectedFarmId],
    queryFn: () =>
      api.get<PondTodayStatusDto[]>(`/dashboard/pond-status?farmId=${selectedFarmId}`),
    enabled: !!selectedFarmId,
  });

  useEffect(() => {
    getPendingCount().then(setPendingCount);
  }, []);

  const handleSync = async () => {
    if (!selectedFarmId) return;
    setSyncing(true);
    try {
      await syncPendingOperations(selectedFarmId);
      await refetch();
      const count = await getPendingCount();
      setPendingCount(count);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <AppShell>
      <div className="px-4 py-4 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold">
              {t('home.greeting', { name: user?.displayName })}
            </h2>
            <p className="text-text-secondary text-sm">{formatDate(new Date())}</p>
            {farm && <p className="text-primary font-medium text-sm">{farm.farmName}</p>}
          </div>
          {pendingCount > 0 && (
            <span className="bg-warning/20 text-warning px-3 py-1 rounded-full text-sm font-medium">
              {t('sync.pending', { count: pendingCount })}
            </span>
          )}
        </div>

        <Link to="/feeding/entry" className="btn-accent flex items-center justify-center gap-2">
          {t('home.addTodayFeeding')}
        </Link>

        <div className="grid grid-cols-3 gap-2">
          <Link to="/inventory/receive" className="card flex flex-col items-center py-3 text-center no-underline text-text-primary">
            <Package size={24} className="text-primary mb-1" />
            <span className="text-xs font-medium">{t('home.receiveFeed')}</span>
          </Link>
          <Link to="/records" className="card flex flex-col items-center py-3 text-center no-underline text-text-primary">
            <FileText size={24} className="text-primary mb-1" />
            <span className="text-xs font-medium">{t('home.recentEntries')}</span>
          </Link>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="card flex flex-col items-center py-3 text-center"
          >
            <RefreshCw size={24} className={`text-primary mb-1 ${syncing ? 'animate-spin' : ''}`} />
            <span className="text-xs font-medium">{t('home.syncNow')}</span>
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">{t('tanks.title')}</h3>
          <AddTankButton compact />
        </div>

        <div className="flex flex-col gap-2">
          {isLoading && <p className="text-text-secondary text-center py-8">{t('common.loading')}</p>}
          {!isLoading && pondStatuses?.length === 0 && (
            <div className="card space-y-3">
              <p className="text-sm text-text-secondary">{t('tanks.noTanks')}</p>
              <AddTankButton />
            </div>
          )}
          {!isLoading && pondStatuses && pondStatuses.length > 0 && (
            <TankRowList tanks={pondStatusesToTankRows(pondStatuses)} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
