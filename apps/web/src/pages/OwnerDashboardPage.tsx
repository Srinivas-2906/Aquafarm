import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { AddTankButton } from '@/components/AddTankButton';
import { PondCard } from '@/components/PondCard';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { formatQty } from '@/lib/utils';
import type { DashboardSummaryDto, FeedUsedByCodeDto } from '@aqualedger/contracts';

function buildFeedUsedPivot(feedUsedByCode: FeedUsedByCodeDto[]) {
  const tankMap = new Map<
    string,
    { pondId: string; pondName: string; pondCode: string }
  >();

  for (const item of feedUsedByCode) {
    for (const pond of item.byPond) {
      if (!tankMap.has(pond.pondId)) {
        tankMap.set(pond.pondId, {
          pondId: pond.pondId,
          pondName: pond.pondName,
          pondCode: pond.pondCode,
        });
      }
    }
  }

  const tanks = Array.from(tankMap.values()).sort((a, b) =>
    a.pondCode.localeCompare(b.pondCode, undefined, { numeric: true }),
  );

  const rows = feedUsedByCode.map((item) => ({
    feedProductId: item.feedProductId,
    feedCode: item.feedCode,
    totalUsedKg: item.totalUsedKg,
    byTank: new Map(item.byPond.map((pond) => [pond.pondId, pond.feedUsedKg])),
  }));

  return { tanks, rows };
}

export function OwnerDashboardPage() {
  const { t } = useTranslation();
  const { selectedFarmId } = useAuth();
  const [feedUsedByCodeOpen, setFeedUsedByCodeOpen] = useState(false);
  const [stockByCodeOpen, setStockByCodeOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', selectedFarmId],
    queryFn: () => api.get<DashboardSummaryDto>(`/dashboard?farmId=${selectedFarmId}`),
    enabled: !!selectedFarmId,
  });

  const feedUsedByCode = data?.feedUsedByCode ?? [];
  const feedUsedPivot = useMemo(
    () => buildFeedUsedPivot(data?.feedUsedByCode ?? []),
    [data?.feedUsedByCode],
  );
  const stockByCode =
    data?.feedStockByCode.filter(
      (item) =>
        parseFloat(item.currentStockKg) > 0 || parseFloat(item.receivedThisMonthKg) > 0,
    ) ?? [];

  return (
    <AppShell farmSelector>
      <div className="px-4 py-4 space-y-4">
        {isLoading && <p className="text-center py-8">{t('common.loading')}</p>}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label={t('dashboard.feedUsed')}
                value={formatQty(data.totalFeedUsedKg)}
                subtitle={t('dashboard.allCodesCombined')}
              />
              <StatCard
                label={t('dashboard.stock')}
                value={formatQty(data.currentFeedStockKg)}
                subtitle={
                  data.currentFeedStockBags > 0
                    ? t('inventory.bags', { count: data.currentFeedStockBags })
                    : t('dashboard.allCodesCombined')
                }
              />
            </div>

            {feedUsedByCode.length > 0 && (
              <div className="card !p-0 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setFeedUsedByCodeOpen((open) => !open)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
                  aria-expanded={feedUsedByCodeOpen}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{t('dashboard.feedUsedByCode')}</p>
                    {!feedUsedByCodeOpen && (
                      <p className="text-xs text-text-secondary mt-0.5">
                        {t('dashboard.feedUsedByCodeSummary', { count: feedUsedByCode.length })}
                      </p>
                    )}
                  </div>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-text-secondary transition-transform ${feedUsedByCodeOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {feedUsedByCodeOpen && (
                  <div className="px-3 pb-3 border-t border-border pt-2 overflow-x-auto">
                    {feedUsedPivot.tanks.length > 0 ? (
                      <div
                        className="min-w-full"
                        style={{
                          display: 'grid',
                          gridTemplateColumns: `minmax(3.5rem, auto) repeat(${feedUsedPivot.tanks.length}, minmax(4.5rem, 1fr)) minmax(3.5rem, auto)`,
                        }}
                      >
                        <div className="px-1 py-1.5 text-[11px] font-semibold text-text-secondary border-b border-border">
                          {t('feeding.feedCode')}
                        </div>
                        {feedUsedPivot.tanks.map((tank) => (
                          <div
                            key={tank.pondId}
                            className="px-1 py-1.5 text-[11px] font-semibold text-text-secondary border-b border-border text-center min-w-0"
                          >
                            <p className="truncate">{tank.pondName}</p>
                            <p className="text-[10px] font-normal">#{tank.pondCode}</p>
                          </div>
                        ))}
                        <div className="px-1 py-1.5 text-[11px] font-semibold text-text-secondary border-b border-border text-right">
                          {t('dashboard.total')}
                        </div>

                        {feedUsedPivot.rows.map((row) => (
                          <div key={row.feedProductId} className="contents">
                            <div className="px-1 py-2 text-xs font-bold text-primary border-b border-border last:border-b-0">
                              {row.feedCode}
                            </div>
                            {feedUsedPivot.tanks.map((tank) => {
                              const qty = row.byTank.get(tank.pondId);
                              return (
                                <div
                                  key={`${row.feedProductId}-${tank.pondId}`}
                                  className="px-1 py-2 text-sm font-semibold text-center border-b border-border last:border-b-0 tabular-nums"
                                >
                                  {qty ? formatQty(qty) : '—'}
                                </div>
                              );
                            })}
                            <div className="px-1 py-2 text-sm font-bold text-right border-b border-border last:border-b-0 tabular-nums">
                              {formatQty(row.totalUsedKg)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-text-secondary py-2">{t('dashboard.noTankUsage')}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {stockByCode.length > 0 && (
              <div className="card !p-0 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setStockByCodeOpen((open) => !open)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
                  aria-expanded={stockByCodeOpen}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{t('dashboard.stockByCode')}</p>
                    {!stockByCodeOpen && (
                      <p className="text-xs text-text-secondary mt-0.5">
                        {t('dashboard.stockByCodeSummary', { count: stockByCode.length })}
                      </p>
                    )}
                  </div>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-text-secondary transition-transform ${stockByCodeOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {stockByCodeOpen && (
                  <div className="px-3 pb-3 border-t border-border pt-2 space-y-2">
                    <div className="grid grid-cols-3 gap-2 px-1 text-[11px] font-semibold text-text-secondary">
                      <span>{t('feeding.feedCode')}</span>
                      <span className="text-right">{t('dashboard.stock')}</span>
                      <span className="text-right">{t('inventory.bagsLabel')}</span>
                    </div>
                    {stockByCode.map((item) => (
                      <div
                        key={item.feedProductId}
                        className="grid grid-cols-3 gap-2 items-center rounded-lg bg-background border border-border py-2 px-2.5"
                      >
                        <p className="text-xs font-bold text-primary">{item.feedCode}</p>
                        <p className="text-sm font-semibold text-right">{formatQty(item.currentStockKg)}</p>
                        <p className="text-[11px] text-text-secondary text-right">
                          {t('inventory.bags', { count: Math.max(0, item.equivalentBags) })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">{t('tanks.title')}</h3>
              <AddTankButton compact />
            </div>

            {data.pondStatuses.length === 0 && (
              <div className="card space-y-3">
                <p className="text-sm text-text-secondary">{t('tanks.noTanks')}</p>
                <AddTankButton />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {data.pondStatuses.map((pond) => <PondCard key={pond.pondId} pond={pond} />)}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="card">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {subtitle && <p className="text-[11px] text-text-secondary mt-0.5">{subtitle}</p>}
    </div>
  );
}
