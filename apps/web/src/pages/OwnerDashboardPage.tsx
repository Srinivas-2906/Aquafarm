import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { AddTankButton } from '@/components/AddTankButton';
import { PondCard } from '@/components/PondCard';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { formatQty } from '@/lib/utils';
import type { DashboardSummaryDto } from '@aqualedger/contracts';

export function OwnerDashboardPage() {
  const { t } = useTranslation();
  const { selectedFarmId } = useAuth();
  const [stockByCodeOpen, setStockByCodeOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', selectedFarmId],
    queryFn: () => api.get<DashboardSummaryDto>(`/dashboard?farmId=${selectedFarmId}`),
    enabled: !!selectedFarmId,
  });

  return (
    <AppShell farmSelector>
      <div className="px-4 py-4 space-y-4">
        {isLoading && <p className="text-center py-8">{t('common.loading')}</p>}
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label={t('dashboard.feedUsed')}
                value={`${formatQty(data.totalFeedUsedKg)}`}
              />
              <StatCard label={t('dashboard.stock')} value={`${formatQty(data.currentFeedStockKg)}`} />
            </div>

            {data.feedStockByCode?.length > 0 && (
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
                        {t('dashboard.stockByCodeSummary', { count: data.feedStockByCode.length })}
                      </p>
                    )}
                  </div>
                  <ChevronDown
                    size={18}
                    className={`shrink-0 text-text-secondary transition-transform ${stockByCodeOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {stockByCodeOpen && (
                  <div className="grid grid-cols-2 gap-2 px-3 pb-3 border-t border-border pt-2">
                    {data.feedStockByCode.map((item) => (
                      <div key={item.feedProductId} className="rounded-lg bg-background border border-border py-2 px-2.5">
                        <p className="text-xs font-bold text-primary">{item.feedCode}</p>
                        <p className="text-sm font-semibold">{formatQty(item.currentStockKg)}</p>
                        <p className="text-[11px] text-text-secondary">
                          {t('inventory.bagsEquivalent', { count: item.equivalentBags })}
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
