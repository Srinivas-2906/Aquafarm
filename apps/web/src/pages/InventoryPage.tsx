import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';
import { formatQty } from '@/lib/utils';
import type { FarmInventoryTotalDto } from '@aqualedger/contracts';

function toEditableStock(value: string): string {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return '0';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, '');
}

function isDraftQuantity(value: string): boolean {
  return value === '' || /^\d*\.?\d{0,3}$/.test(value);
}

function parseQuantityForSave(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return '0';

  const normalized = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
  if (!normalized) return '0';
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) return null;

  const n = parseFloat(normalized);
  if (Number.isNaN(n) || n < 0) return null;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, '');
}

export function InventoryPage() {
  const { t } = useTranslation();
  const { selectedFarmId } = useAuth();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [draft, setDraft] = useState('0');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inventory-total', selectedFarmId],
    queryFn: () => api.get<FarmInventoryTotalDto>(`/inventory/total?farmId=${selectedFarmId}`),
    enabled: !!selectedFarmId,
  });

  const savedStock = data ? toEditableStock(data.totalStockKg) : '0';
  const parsedDraft = parseQuantityForSave(draft);
  const canSave = parsedDraft !== null && isDraftQuantity(draft);

  useEffect(() => {
    setMode('view');
    setSaved(false);
    setError(null);
  }, [selectedFarmId]);

  const startEditing = () => {
    setMode('edit');
    setSaved(false);
    setError(null);
    setDraft(savedStock);
  };

  const cancelEditing = () => {
    setMode('view');
    setSaved(false);
    setError(null);
    setDraft(savedStock);
  };

  const handleSave = async () => {
    if (!selectedFarmId) return;
    const quantityKg = parseQuantityForSave(draft);
    if (!quantityKg) {
      setError(t('inventory.invalidQuantity'));
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const updated = await api.patch<FarmInventoryTotalDto>('/inventory/total', {
        farmId: selectedFarmId,
        quantityKg,
      });
      queryClient.setQueryData(['inventory-total', selectedFarmId], updated);
      setDraft(toEditableStock(updated.totalStockKg));
      await queryClient.invalidateQueries({ queryKey: ['dashboard', selectedFarmId] });
      setSaved(true);
      setMode('view');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const isEditing = mode === 'edit';

  return (
    <AppShell title={t('inventory.title')}>
      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {isLoading && <p className="text-center py-8">{t('common.loading')}</p>}

        {!isLoading && (
          <div className="card bg-primary-light space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-text-secondary">{t('inventory.totalStock')}</p>
                <p className="text-xs text-text-secondary mt-1">{t('inventory.perFarmNote')}</p>
              </div>
              {!isEditing && (
                <button
                  type="button"
                  onClick={startEditing}
                  className="btn-secondary btn-inline !text-xs !py-1.5 !px-2.5 !min-h-0 shrink-0 flex items-center gap-1"
                >
                  <Pencil size={14} />
                  {t('common.edit')}
                </button>
              )}
            </div>

            {isEditing ? (
              <>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draft}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!isDraftQuantity(v)) return;
                        setDraft(v);
                        setSaved(false);
                        setError(null);
                      }}
                      onFocus={(e) => e.target.select()}
                      className="input-field text-3xl font-bold !py-3"
                      aria-label={t('inventory.totalStock')}
                      autoFocus
                    />
                  </div>
                  <span className="text-xl font-semibold text-primary pb-3">kg</span>
                </div>

                <div className="flex gap-2">
                  <button type="button" onClick={cancelEditing} className="btn-secondary flex-1 !py-2 !text-sm">
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving || !selectedFarmId || !canSave}
                    className="btn-primary flex-1 !py-2 !text-sm"
                  >
                    {saving ? t('common.loading') : t('common.save')}
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={startEditing}
                className="text-left w-full"
              >
                <p className="text-3xl font-bold text-primary">{formatQty(savedStock)}</p>
              </button>
            )}

            {isError && !error && (
              <p className="text-danger text-sm">{t('inventory.loadError')}</p>
            )}
            {error && <p className="text-danger text-sm">{error}</p>}
            {saved && !isEditing && (
              <p className="text-success text-sm font-medium">{t('feeding.saved')}</p>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
