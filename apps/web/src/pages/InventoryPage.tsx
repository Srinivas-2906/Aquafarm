import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';
import { getTodayISO, formatQty, formatShortDate } from '@/lib/utils';
import type { FarmStockEntriesDto, FeedProductDto } from '@aqualedger/contracts';

const FEED_CODE_ORDER = ['1C', '2C', '20', '3S', '3SP', '3P'];

function sortFeedProducts(products: FeedProductDto[]): FeedProductDto[] {
  return [...products].sort(
    (a, b) => FEED_CODE_ORDER.indexOf(a.feedCode) - FEED_CODE_ORDER.indexOf(b.feedCode),
  );
}

function isDraftBags(value: string): boolean {
  return value === '' || /^\d*$/.test(value);
}

function parseBagsForSave(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = parseInt(trimmed, 10);
  if (Number.isNaN(n) || n < 1) return null;
  return n;
}

function resolveFeedCode(
  entry: FarmStockEntriesDto['entries'][number],
  products: FeedProductDto[],
): string {
  if (entry.feedCode) return entry.feedCode;
  return products.find((p) => p.id === entry.feedProductId)?.feedCode ?? '—';
}

export function InventoryPage() {
  const { t } = useTranslation();
  const { selectedFarmId } = useAuth();
  const queryClient = useQueryClient();
  const [draftBags, setDraftBags] = useState('');
  const [draftDate, setDraftDate] = useState(() => getTodayISO());
  const [feedProductId, setFeedProductId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<'created' | 'updated' | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  const todayISO = getTodayISO();

  const { data: feedProducts } = useQuery({
    queryKey: ['feed-products', selectedFarmId],
    queryFn: () => api.get<FeedProductDto[]>(`/farms/${selectedFarmId}/feed-products`),
    enabled: !!selectedFarmId,
  });

  const sortedProducts = useMemo(
    () => (feedProducts ? sortFeedProducts(feedProducts) : []),
    [feedProducts],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inventory-entries', selectedFarmId],
    queryFn: () => api.get<FarmStockEntriesDto>(`/inventory/entries?farmId=${selectedFarmId}`),
    enabled: !!selectedFarmId,
  });

  useEffect(() => {
    setError(null);
    setDraftBags('');
    setDraftDate(getTodayISO());
    setFeedProductId('');
    setSaveNotice(null);
    setEditingEntryId(null);
  }, [selectedFarmId]);

  const resetForm = () => {
    setError(null);
    setDraftBags('');
    setDraftDate(getTodayISO());
    setFeedProductId(sortedProducts[0]?.id ?? '');
    setSaveNotice(null);
    setEditingEntryId(null);
  };

  const startEdit = (entry: FarmStockEntriesDto['entries'][number]) => {
    setEditingEntryId(entry.id);
    setDraftDate(entry.transactionDate);
    setFeedProductId(entry.feedProductId);
    setDraftBags(String(entry.numberOfBags));
    setError(null);
    setSaveNotice(null);
  };

  useEffect(() => {
    if (!sortedProducts.length) return;
    if (!feedProductId || !sortedProducts.some((p) => p.id === feedProductId)) {
      setFeedProductId(sortedProducts[0].id);
    }
  }, [sortedProducts, feedProductId]);

  const handleSave = async () => {
    setError(null);

    if (!selectedFarmId) {
      setError(t('inventory.selectFarm'));
      return;
    }

    if (!feedProductId) {
      setError(t('inventory.selectFeedCode'));
      return;
    }

    if (!draftDate) {
      setError(t('inventory.enterDate'));
      return;
    }

    const numberOfBags = parseBagsForSave(draftBags);
    if (numberOfBags === null) {
      setError(t('inventory.enterBags'));
      return;
    }

    setSaving(true);
    setSaveNotice(null);
    const wasEditing = !!editingEntryId;

    try {
      if (editingEntryId) {
        await api.patch(`/inventory/entries/${editingEntryId}`, {
          feedProductId,
          numberOfBags,
          transactionDate: draftDate,
        });
      } else {
        await api.post('/inventory/entries', {
          farmId: selectedFarmId,
          feedProductId,
          numberOfBags,
          transactionDate: draftDate,
        });
      }
      resetForm();
      setSaveNotice(wasEditing ? 'updated' : 'created');
      await queryClient.invalidateQueries({ queryKey: ['inventory-entries', selectedFarmId] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', selectedFarmId] });
    } catch (err) {
      const raw = err instanceof ApiError ? err.message : t('common.error');
      const lower = raw.toLowerCase();
      if (lower.includes('feed code')) {
        setError(t('inventory.selectFeedCode'));
      } else if (lower.includes('number of bags')) {
        setError(t('inventory.enterBags'));
      } else if (lower.includes('date')) {
        setError(t('inventory.enterDate'));
      } else if (lower.includes('no feed products')) {
        setError(t('inventory.noProducts'));
      } else {
        setError(raw);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title={t('inventory.title')}>
      <div className="px-4 py-4 max-w-lg mx-auto flex flex-col gap-3 min-h-0">
        {isLoading && <p className="text-center py-8">{t('common.loading')}</p>}

        {!isLoading && (
          <>
            <div className={`card space-y-3 ${editingEntryId ? 'ring-2 ring-primary/30' : 'bg-primary-light'}`}>
              {editingEntryId && (
                <p className="text-sm font-medium text-primary">{t('inventory.editingRecord')}</p>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-text-secondary">{t('inventory.farmStock')}</span>
                <span className="text-xl font-bold text-primary tabular-nums">
                  {formatQty(data?.totalStockKg ?? '0')}
                </span>
              </div>

              <div className="grid grid-cols-[minmax(0,1.05fr)_minmax(0,0.72fr)_minmax(0,0.72fr)] gap-x-3 gap-y-2 items-end min-w-0">
                <div className="min-w-0 pr-1">
                  <label className="label !mb-0.5" htmlFor="inventory-date">
                    {t('inventory.dateLabel')}
                  </label>
                  <input
                    id="inventory-date"
                    type="date"
                    value={draftDate}
                    max={todayISO}
                    onChange={(e) => {
                      setDraftDate(e.target.value);
                      setError(null);
                      setSaveNotice(null);
                    }}
                    className="input-compact !min-h-0 !py-2 !px-1 !text-xs font-semibold w-full min-w-0 max-w-full box-border"
                  />
                </div>

                <div className="min-w-0 pl-0.5">
                  <label className="label !mb-0.5" htmlFor="inventory-feed-code">
                    {t('feeding.feedCode')}
                  </label>
                  <select
                    id="inventory-feed-code"
                    value={feedProductId}
                    onChange={(e) => {
                      setFeedProductId(e.target.value);
                      setError(null);
                      setSaveNotice(null);
                    }}
                    className="input-compact !min-h-0 !py-2 !text-sm font-bold w-full min-w-0"
                    disabled={!sortedProducts.length}
                  >
                    {!sortedProducts.length && <option value="">{t('inventory.noProducts')}</option>}
                    {sortedProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.feedCode}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <label className="label !mb-0.5" htmlFor="inventory-bags">
                    {t('inventory.bagsLabel')}
                  </label>
                  <input
                    id="inventory-bags"
                    type="text"
                    inputMode="numeric"
                    value={draftBags}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!isDraftBags(v)) return;
                      setDraftBags(v);
                      setError(null);
                      setSaveNotice(null);
                    }}
                    className="input-field !py-2 !text-lg font-bold w-full min-w-0"
                    placeholder="0"
                  />
                </div>
              </div>

              {error && (
                <p className="text-danger text-sm" role="alert">
                  {error}
                </p>
              )}
              {isError && !error && (
                <p className="text-danger text-sm">{t('inventory.loadError')}</p>
              )}

              {saveNotice && !error && (
                <p className="text-success text-sm font-medium">
                  {saveNotice === 'updated' ? t('inventory.updated') : t('inventory.saved')}
                </p>
              )}

              <div className="flex gap-2">
                {editingEntryId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    disabled={saving}
                    className="btn-secondary flex-1 !py-2.5 !text-sm"
                  >
                    {t('common.cancel')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !selectedFarmId || !sortedProducts.length}
                  className={`btn-primary !py-2.5 !text-sm ${editingEntryId ? 'flex-1' : 'w-full'}`}
                >
                  {saving
                    ? t('common.loading')
                    : editingEntryId
                      ? t('inventory.updateStock')
                      : t('inventory.saveStock')}
                </button>
              </div>
            </div>

            <div className="card space-y-2 flex-1 min-h-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-text-primary">{t('inventory.records')}</p>
                {!!data?.entries.length && (
                  <p className="text-xs text-text-secondary tabular-nums text-right shrink-0">
                    {t('inventory.recordsTotal', {
                      bags: data.totalBags,
                      kg: formatQty(
                        String(
                          data.entries.reduce((sum, e) => sum + parseFloat(e.quantityKg), 0),
                        ),
                      ),
                    })}
                  </p>
                )}
              </div>

              {!data?.entries.length ? (
                <p className="text-sm text-text-secondary py-4 text-center">{t('inventory.noRecords')}</p>
              ) : (
                <>
                  <div className="grid grid-cols-[minmax(0,1.1fr)_auto_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] gap-x-2 gap-y-0 px-1 text-[11px] font-medium text-text-secondary uppercase tracking-wide">
                    <span>{t('inventory.dateLabel')}</span>
                    <span>{t('feeding.feedCode')}</span>
                    <span className="text-right">{t('inventory.bagsLabel')}</span>
                    <span className="text-right">{t('inventory.totalKgLabel')}</span>
                    <span className="sr-only">{t('common.edit')}</span>
                  </div>
                  <ul className="divide-y divide-border max-h-[50vh] overflow-y-auto">
                    {data.entries.map((entry) => (
                      <li
                        key={entry.id}
                        className={`grid grid-cols-[minmax(0,1.1fr)_auto_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] gap-x-2 gap-y-0 items-center py-2.5 px-1 min-w-0 ${
                          editingEntryId === entry.id ? 'bg-primary/5 rounded-md' : ''
                        }`}
                      >
                        <span className="text-sm font-medium text-text-primary truncate">
                          {formatShortDate(entry.transactionDate)}
                        </span>
                        <span className="text-xs font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5 shrink-0">
                          {resolveFeedCode(entry, sortedProducts)}
                        </span>
                        <span className="text-sm font-semibold text-text-primary tabular-nums text-right truncate">
                          {entry.numberOfBags} {t('inventory.bagsUnitShort')}
                        </span>
                        <span className="text-sm text-text-secondary tabular-nums text-right truncate">
                          {formatQty(entry.quantityKg)}
                        </span>
                        <button
                          type="button"
                          onClick={() => startEdit(entry)}
                          disabled={saving}
                          className="btn-secondary btn-inline !text-xs !py-1 !px-2 !min-h-0 flex items-center gap-1 shrink-0"
                          aria-label={t('inventory.editRecord')}
                        >
                          <Pencil size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
