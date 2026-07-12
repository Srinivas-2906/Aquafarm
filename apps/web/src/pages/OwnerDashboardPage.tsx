import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { PondCard } from '@/components/PondCard';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import type { DashboardSummaryDto } from '@aqualedger/contracts';

export function OwnerDashboardPage() {
  const { t } = useTranslation();
  const { selectedFarmId } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', selectedFarmId],
    queryFn: () => api.get<DashboardSummaryDto>(`/dashboard?farmId=${selectedFarmId}`),
    enabled: !!selectedFarmId,
  });

  return (
    <AppShell title={t('dashboard.title')}>
      <div className="px-4 py-4 space-y-4">
        {isLoading && <p className="text-center py-8">{t('common.loading')}</p>}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label={t('dashboard.feedToday')} value={`${data.totalFeedTodayKg} kg`} />
              <StatCard label={t('dashboard.stock')} value={`${data.currentFeedStockKg} kg`} />
              <StatCard label={t('dashboard.pending')} value={String(data.pendingApprovals)} highlight={data.pendingApprovals > 0} />
              <StatCard label="Active Tanks" value={String(data.activePonds)} />
            </div>

            {data.attentionItems.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <AlertTriangle size={18} className="text-warning" />
                  {t('dashboard.attention')}
                </h3>
                <div className="space-y-2">
                  {data.attentionItems.map((item, i) => (
                    <div key={i} className={`card text-sm ${item.severity === 'danger' ? 'border-danger' : 'border-warning'}`}>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-text-secondary">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.pendingApprovals > 0 && (
              <Link to="/approvals" className="btn-primary text-center block">
                {t('approvals.title')} ({data.pendingApprovals})
              </Link>
            )}

            <h3 className="font-semibold">Today's Tanks</h3>
            <div className="space-y-3">
              {data.pondStatuses.map((pond) => <PondCard key={pond.pondId} pond={pond} />)}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`card ${highlight ? 'border-warning bg-warning/5' : ''}`}>
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
