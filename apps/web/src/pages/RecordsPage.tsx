import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock, Edit, Eye } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { getTodayISO, getYesterdayISO, formatDate } from '@/lib/utils';
import type { FeedingEntryDto } from '@aqualedger/contracts';
import { UserRole } from '@/types/roles';

export function RecordsPage() {
  const { t } = useTranslation();
  const { selectedFarmId, user } = useAuth();
  const today = getTodayISO();
  const yesterday = getYesterdayISO();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data, isLoading } = useQuery({
    queryKey: ['feeding-records', selectedFarmId],
    queryFn: () =>
      api.get<{ data: FeedingEntryDto[] }>(
        `/feeding-entries?farmId=${selectedFarmId}&dateFrom=${weekAgo.toISOString().split('T')[0]}&dateTo=${today}&pageSize=100`,
      ),
    enabled: !!selectedFarmId,
  });

  const isOwner = user?.role === UserRole.OWNER;

  return (
    <AppShell title={t('records.title')}>
      <div className="px-4 py-4 space-y-3">
        {isLoading && <p className="text-center text-text-secondary py-8">{t('common.loading')}</p>}
        {data?.data.map((entry) => {
          const isToday = entry.feedingDate === today;
          const isYesterday = entry.feedingDate === yesterday;
          const dateLabel = isToday
            ? t('records.today')
            : isYesterday
              ? t('records.yesterday')
              : formatDate(entry.feedingDate);

          return (
            <div key={entry.id} className="card">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-lg">{entry.pondName}</h3>
                  <p className="text-sm text-text-secondary">
                    {dateLabel} — DOC {entry.doc} — {entry.feedCode}
                  </p>
                </div>
                <SyncStatusBadge status={entry.syncStatus} />
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xl font-semibold">{entry.totalDailyFeedKg} kg</p>
                  <p className="text-xs text-text-secondary">
                    {entry.meals.length} meals — {entry.enteredByName}
                  </p>
                </div>
                {entry.isEditable || isOwner ? (
                  <Link
                    to={`/feeding/entry/${entry.id}`}
                    className="flex items-center gap-1 text-primary font-medium min-h-touch px-3"
                  >
                    <Edit size={18} />
                    {t('records.edit')}
                  </Link>
                ) : (
                  <span className="flex items-center gap-1 text-text-secondary min-h-touch px-3">
                    <Lock size={18} />
                    {t('records.view')}
                  </span>
                )}
              </div>
              {entry.isLocked && !isOwner && (
                <p className="text-xs text-warning mt-2">{t('feeding.lockedMessage')}</p>
              )}
            </div>
          );
        })}
        {!isLoading && data?.data.length === 0 && (
          <p className="text-center text-text-secondary py-8">No entries found</p>
        )}
      </div>
    </AppShell>
  );
}
