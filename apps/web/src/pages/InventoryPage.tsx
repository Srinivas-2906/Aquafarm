import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, AlertTriangle } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import type { InventorySummaryDto } from '@aqualedger/contracts';

export function InventoryPage() {
  const { t } = useTranslation();
  const { selectedFarmId } = useAuth();

  const { data: summary, isLoading } = useQuery({
    queryKey: ['inventory-summary', selectedFarmId],
    queryFn: () => api.get<InventorySummaryDto[]>(`/inventory/summary?farmId=${selectedFarmId}`),
    enabled: !!selectedFarmId,
  });

  const totalStock = summary?.reduce((s, p) => s + parseFloat(p.currentStockKg), 0).toFixed(1);

  return (
    <AppShell title={t('inventory.title')}>
      <div className="px-4 py-4 space-y-4">
        <div className="card bg-primary-light">
          <p className="text-sm text-text-secondary">{t('inventory.currentStock')}</p>
          <p className="text-3xl font-bold text-primary">{totalStock || '0'} kg</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link to="/inventory/receive" className="btn-primary flex items-center justify-center gap-2 !text-base">
            <Plus size={20} />
            {t('inventory.receive')}
          </Link>
          <Link to="/inventory/damage" className="btn-secondary flex items-center justify-center gap-2 !text-base">
            <AlertTriangle size={20} />
            {t('inventory.damage')}
          </Link>
        </div>

        {isLoading && <p className="text-center py-8">{t('common.loading')}</p>}
        {summary?.map((product) => (
          <div key={product.feedProductId} className={`card ${product.isLowStock ? 'border-danger' : ''}`}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold">{product.feedCode}</h3>
                <p className="text-sm text-text-secondary">{product.brandName}</p>
              </div>
              {product.isLowStock && (
                <span className="text-danger text-xs font-medium bg-danger/10 px-2 py-1 rounded">
                  {t('inventory.lowStock')}
                </span>
              )}
            </div>
            <p className="text-2xl font-bold mt-2">{product.currentStockKg} kg</p>
            <p className="text-sm text-text-secondary">
              {t('inventory.bags', { count: product.equivalentBags })} — {product.bagWeightKg} kg/bag
            </p>
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-text-secondary">
              <span>Today: {product.consumedTodayKg} kg</span>
              <span>Month: {product.consumedThisMonthKg} kg</span>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
