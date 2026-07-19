import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Pencil, ChevronDown, Minus, BarChart3 } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { AddTankButton } from '@/components/AddTankButton';
import { EditTankNameButton } from '@/components/EditTankNameButton';
import { FeedCodeCheckboxDropdown } from '@/components/FeedCodeCheckboxDropdown';
import { RecordLockNotice } from '@/components/RecordLockNotice';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/roles';
import { api, ApiError } from '@/lib/api';
import { saveFeedingLocally } from '@/lib/sync';
import {
  getTodayISO,
  formatQty,
  formatShortDate,
  getDefaultMealTime,
  from24HourTime,
  to24HourTime,
  formatFeedQtyKg,
  convertQuantityUnit,
  quantityToKg,
  isSupervisorEditableDate,
  type QuantityUnit,
} from '@/lib/utils';
import type { PondDto, FeedProductDto, FeedingEntryDto } from '@aqualedger/contracts';

const FEED_CODE_ORDER = ['1C', '2C', '20', '3S', '3SP', '3P'];

function sortFeedProducts(products: FeedProductDto[]): FeedProductDto[] {
  return [...products].sort(
    (a, b) => FEED_CODE_ORDER.indexOf(a.feedCode) - FEED_CODE_ORDER.indexOf(b.feedCode),
  );
}

type FeedRow = {
  key: string;
  mealId?: string;
  mealNumber: number;
  feedProductId: string;
  quantity: string;
  quantityUnit: QuantityUnit;
  hour: string;
  ampm: 'AM' | 'PM';
};

function defaultRow(mealNumber = 1, feedProductId = ''): FeedRow {
  const { hour, ampm } = from24HourTime(getDefaultMealTime());
  return { key: uuidv4(), mealNumber, feedProductId, quantity: '', quantityUnit: 'kg', hour, ampm };
}

function rowsFromEntry(entry: FeedingEntryDto): FeedRow[] {
  if (!entry.meals.length) return [defaultRow(1, entry.feedProductId)];
  return entry.meals
    .sort((a, b) => a.mealNumber - b.mealNumber)
    .map((meal) => {
      const { hour, ampm } = from24HourTime(meal.actualTime || getDefaultMealTime());
      return {
        key: meal.id,
        mealId: meal.id,
        mealNumber: meal.mealNumber,
        feedProductId: meal.feedProductId || entry.feedProductId,
        quantity: meal.feedQuantityKg,
        quantityUnit: 'kg' as const,
        hour,
        ampm,
      };
    });
}

function codeIdsFromEntry(entry: FeedingEntryDto): string[] {
  const ids = entry.meals
    .map((meal) => meal.feedProductId || entry.feedProductId)
    .filter(Boolean);
  return [...new Set(ids)];
}

function readError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

async function fetchEntryForDate(
  farmId: string,
  pondId: string,
  feedingDate: string,
): Promise<FeedingEntryDto | null> {
  const result = await api.get<{ data: FeedingEntryDto[] }>(
    `/feeding-entries?farmId=${farmId}&pondId=${pondId}&dateFrom=${feedingDate}&dateTo=${feedingDate}`,
  );
  return result.data[0] || null;
}

export function FeedingEntryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { entryId } = useParams();
  const { selectedFarmId, user } = useAuth();
  const queryClient = useQueryClient();

  const pondIdParam = searchParams.get('pondId') || '';
  const [selectedPondId, setSelectedPondId] = useState(pondIdParam);
  const [feedingDate, setFeedingDate] = useState(getTodayISO());
  const [feedProductId, setFeedProductId] = useState('');
  const [rows, setRows] = useState<FeedRow[]>([defaultRow()]);
  const [selectedCodeIds, setSelectedCodeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [mode, setMode] = useState<'view' | 'add' | 'edit'>('view');

  const todayISO = getTodayISO();
  const isOwner = user?.role === UserRole.OWNER;

  const { data: entryById } = useQuery({
    queryKey: ['feeding-entry', entryId],
    queryFn: () => api.get<FeedingEntryDto>(`/feeding-entries/${entryId}`),
    enabled: !!entryId,
  });

  useEffect(() => {
    if (pondIdParam) {
      setSelectedPondId(pondIdParam);
      return;
    }
    if (!entryId) {
      setSelectedPondId('');
    }
  }, [pondIdParam, entryId]);

  useEffect(() => {
    if (entryById) {
      setSelectedPondId(entryById.pondId);
      setFeedingDate(entryById.feedingDate.split('T')[0]);
      setFeedProductId(entryById.feedProductId);
      setSelectedCodeIds(codeIdsFromEntry(entryById));
      setRows(rowsFromEntry(entryById));
      setMode('view');
    }
  }, [entryById]);

  const { data: ponds } = useQuery({
    queryKey: ['ponds', selectedFarmId],
    queryFn: () => api.get<PondDto[]>(`/farms/${selectedFarmId}/ponds`),
    enabled: !!selectedFarmId,
  });

  const { data: feedProducts } = useQuery({
    queryKey: ['feed-products', selectedFarmId],
    queryFn: () => api.get<FeedProductDto[]>(`/farms/${selectedFarmId}/feed-products`),
    enabled: !!selectedFarmId,
  });

  const { data: existingEntry, refetch: refetchEntry, isSuccess: entryLoaded } = useQuery({
    queryKey: ['feeding-entry-by-date', selectedPondId, feedingDate],
    queryFn: () => fetchEntryForDate(selectedFarmId!, selectedPondId, feedingDate),
    enabled: !!selectedPondId && !!selectedFarmId && !entryId,
  });

  const sortedFeedProducts = useMemo(
    () => (feedProducts ? sortFeedProducts(feedProducts) : undefined),
    [feedProducts],
  );

  useEffect(() => {
    if (entryId) return;
    if (!selectedPondId || !selectedFarmId || !entryLoaded) return;
    if (!existingEntry) return;

    setRows(rowsFromEntry(existingEntry));
    setFeedProductId(existingEntry.feedProductId);
    setSelectedCodeIds(codeIdsFromEntry(existingEntry));
    setMode('view');
  }, [existingEntry, entryId, entryLoaded, selectedPondId, selectedFarmId, feedingDate]);

  useEffect(() => {
    if (entryId) return;
    if (!selectedPondId || !selectedFarmId || !entryLoaded || existingEntry) return;
    if (!sortedFeedProducts?.length) return;

    const defaultId =
      sortedFeedProducts.find((fp) => fp.feedCode === '1C')?.id || sortedFeedProducts[0].id;
    setSelectedCodeIds(defaultId ? [defaultId] : []);
    setRows([defaultRow(1, defaultId)]);
    setMode('add');
    setSaveOk(false);
  }, [existingEntry, entryId, entryLoaded, selectedPondId, selectedFarmId, feedingDate, sortedFeedProducts]);

  useEffect(() => {
    if (!sortedFeedProducts?.length) return;
    setFeedProductId((current) => {
      if (current && sortedFeedProducts.some((fp) => fp.id === current)) return current;
      if (existingEntry?.feedProductId && sortedFeedProducts.some((fp) => fp.id === existingEntry.feedProductId)) {
        return existingEntry.feedProductId;
      }
      return sortedFeedProducts.find((fp) => fp.feedCode === '1C')?.id || sortedFeedProducts[0].id;
    });
  }, [sortedFeedProducts, existingEntry?.feedProductId]);

  const selectedPond = ponds?.find((p) => p.id === selectedPondId);
  const activeEntry = entryById || existingEntry;
  const resolvedFeedProductId =
    feedProductId || sortedFeedProducts?.find((fp) => fp.feedCode === '1C')?.id || sortedFeedProducts?.[0]?.id || '';
  const activeCodeProducts = useMemo(
    () => sortedFeedProducts?.filter((fp) => selectedCodeIds.includes(fp.id)) ?? [],
    [sortedFeedProducts, selectedCodeIds],
  );
  const canEditDate = isSupervisorEditableDate(feedingDate);
  const canEdit = isOwner || (activeEntry?.isEditable ?? canEditDate);
  const hasPersistedMeals =
    rows.some((row) => row.mealId) ||
    (activeEntry?.meals.length ?? 0) > 0 ||
    parseFloat(activeEntry?.totalDailyFeedKg ?? '0') > 0;
  const hasSavedEntry = hasPersistedMeals;
  const isFormActive = !hasSavedEntry || mode !== 'view';
  const feedCodeLabel =
    sortedFeedProducts?.find((fp) => fp.id === resolvedFeedProductId)?.feedCode ||
    activeEntry?.feedCode ||
    '—';

  const dayTotal = useMemo(() => {
    const rowTotal = rows.reduce((sum, row) => sum + quantityToKg(row.quantity, row.quantityUnit), 0);
    if (rowTotal > 0) return rowTotal.toFixed(1);
    return activeEntry?.totalDailyFeedKg || '0';
  }, [rows, activeEntry]);

  const goToTankList = () => {
    navigate('/feeding/entry');
    setSelectedPondId('');
    setMode('view');
    setSaveError(null);
    setSaveOk(false);
  };

  const handleTankPick = (pondId: string) => {
    navigate(`/feeding/entry?pondId=${pondId}`);
  };

  const handleDateChange = (value: string) => {
    if (!value || value > todayISO) return;
    setFeedingDate(value);
    setSaveError(null);
    setSaveOk(false);
  };

  const openTankReport = () => {
    navigate(`/reports?pondId=${selectedPondId}&from=feeding`);
  };

  const dayTotalLabel =
    feedingDate === todayISO
      ? t('feeding.todayTotal')
      : t('feeding.dayTotal', { date: formatShortDate(feedingDate) });

  const startEditing = () => {
    setMode('edit');
    const ids = [...new Set(rows.map((row) => row.feedProductId).filter(Boolean))];
    if (ids.length) setSelectedCodeIds(ids);
    setSaveError(null);
    setSaveOk(false);
  };

  const cancelEditing = () => {
    setMode('view');
    setSaveError(null);
    setSaveOk(false);
    if (activeEntry) {
      setFeedProductId(activeEntry.feedProductId);
      setSelectedCodeIds(codeIdsFromEntry(activeEntry));
      setRows(rowsFromEntry(activeEntry));
    }
  };

  const updateRow = (key: string, patch: Partial<FeedRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setSaveError(null);
    setSaveOk(false);
  };

  const toggleFeedCode = (productId: string, assignRowKey?: string) => {
    setSelectedCodeIds((current) => {
      if (current.includes(productId)) {
        if (current.length === 1) return current;
        const next = current.filter((id) => id !== productId);
        setRows((rowsCurrent) =>
          rowsCurrent.map((row) =>
            row.feedProductId === productId && !row.mealId
              ? { ...row, feedProductId: next[0] || resolvedFeedProductId }
              : row,
          ),
        );
        return next;
      }

      const next = [...current, productId];
      setRows((rowsCurrent) => {
        if (assignRowKey) {
          const target = rowsCurrent.find((row) => row.key === assignRowKey);
          const targetQty = target
            ? formatFeedQtyKg(target.quantity, target.quantityUnit)
            : '';
          const targetHasDifferentCode =
            !!target?.feedProductId && target.feedProductId !== productId;

          if (!targetQty && !targetHasDifferentCode) {
            return rowsCurrent.map((row) =>
              row.key === assignRowKey ? { ...row, feedProductId: productId } : row,
            );
          }

          const alreadyHasRow = rowsCurrent.some(
            (row) => row.feedProductId === productId && !row.mealId,
          );
          if (alreadyHasRow) return rowsCurrent;

          const nextNumber = Math.max(0, ...rowsCurrent.map((r) => r.mealNumber)) + 1;
          return [...rowsCurrent, defaultRow(nextNumber, productId)];
        }

        const alreadyHasRow = rowsCurrent.some(
          (row) => row.feedProductId === productId && !row.mealId,
        );
        if (alreadyHasRow) return rowsCurrent;

        const nextNumber = Math.max(0, ...rowsCurrent.map((r) => r.mealNumber)) + 1;
        return [...rowsCurrent, defaultRow(nextNumber, productId)];
      });
      return next;
    });
    setSaveError(null);
    setSaveOk(false);
  };

  const addRow = () => {
    if (hasSavedEntry && mode === 'view') {
      setMode('add');
      setSaveError(null);
      setSaveOk(false);
    }
    const nextNumber = Math.max(0, ...rows.map((r) => r.mealNumber)) + 1;
    const usedIds = new Set(rows.map((row) => row.feedProductId).filter(Boolean));
    const nextProduct =
      activeCodeProducts.find((product) => !usedIds.has(product.id)) ||
      activeCodeProducts[0];
    const defaultProductId = nextProduct?.id || resolvedFeedProductId;
    setRows((current) => [...current, defaultRow(nextNumber, defaultProductId)]);
  };

  const removeRow = (key: string) => {
    setRows((current) => {
      const target = current.find((row) => row.key === key);
      if (!target || target.mealId) return current;

      const unsavedRows = current.filter((row) => !row.mealId);
      if (!hasSavedEntry && unsavedRows.length <= 1) return current;

      const next = current.filter((row) => row.key !== key);
      return next.length ? next : [defaultRow(1, activeCodeProducts[0]?.id || resolvedFeedProductId)];
    });
    setSaveError(null);
    setSaveOk(false);
  };

  const ensurePondReady = async (): Promise<PondDto> => {
    let pond = ponds?.find((p) => p.id === selectedPondId);
    if (pond?.activeCycle) return pond;

    await api.post(`/ponds/${selectedPondId}/culture-cycle`, {});
    const fresh = await queryClient.fetchQuery({
      queryKey: ['ponds', selectedFarmId],
      queryFn: () => api.get<PondDto[]>(`/farms/${selectedFarmId}/ponds`),
    });
    pond = fresh?.find((p) => p.id === selectedPondId);
    if (!pond?.activeCycle) {
      throw new ApiError(400, t('feeding.noActiveCycle'));
    }
    return pond;
  };

  const persistMeals = async (entry: FeedingEntryDto, filled: FeedRow[]) => {
    for (const row of filled) {
      const qty = formatFeedQtyKg(row.quantity, row.quantityUnit);
      if (!qty) continue;
      const payload = {
        feedQuantityKg: qty,
        feedProductId: row.feedProductId || resolvedFeedProductId,
        actualTime: to24HourTime(row.hour, '00', row.ampm),
      };
      if (row.mealId) {
        await api.patch(`/feeding-entries/${entry.id}/meals/${row.mealId}`, payload);
      } else {
        await api.post(`/feeding-entries/${entry.id}/meals`, {
          mealNumber: row.mealNumber,
          ...payload,
        });
      }
    }
  };

  const handleSaveAll = async () => {
    if (!selectedFarmId) return;

    const filled = rows
      .map((row) => ({
        ...row,
        quantity: formatFeedQtyKg(row.quantity, row.quantityUnit),
        quantityUnit: 'kg' as const,
      }))
      .filter((row) => row.quantity);

    if (!filled.length) return;
    if (!resolvedFeedProductId) {
      setSaveError(t('feeding.selectFeedCode'));
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveOk(false);

    try {
      const pond = await ensurePondReady();
      let entry =
        activeEntry ||
        (await fetchEntryForDate(selectedFarmId, selectedPondId, feedingDate));

      if (!entry) {
        const primaryFeedProductId = filled[0].feedProductId || resolvedFeedProductId;
        const body = {
          clientEntryId: uuidv4(),
          farmId: selectedFarmId,
          pondId: selectedPondId,
          cultureCycleId: pond.activeCycle!.id,
          feedingDate,
          feedProductId: primaryFeedProductId,
          meals: filled.map((row) => ({
            mealNumber: row.mealNumber,
            feedProductId: row.feedProductId || primaryFeedProductId,
            feedQuantityKg: row.quantity,
            actualTime: to24HourTime(row.hour, '00', row.ampm),
          })),
          deviceCreatedAt: new Date().toISOString(),
        };

        try {
          entry = await api.post<FeedingEntryDto>('/feeding-entries', body);
          queryClient.setQueryData(['feeding-entry-by-date', selectedPondId, feedingDate], entry);
        } catch (err) {
          if (err instanceof ApiError && err.statusCode === 409) {
            entry = await fetchEntryForDate(selectedFarmId, selectedPondId, feedingDate);
            if (entry) await persistMeals(entry, filled);
            else throw err;
          } else if (!navigator.onLine) {
            await saveFeedingLocally(body, selectedFarmId);
          } else {
            throw err;
          }
        }
      } else {
        const productIds = [
          ...new Set(
            filled.map((row) => row.feedProductId || resolvedFeedProductId).filter(Boolean),
          ),
        ];
        if (productIds.length === 1 && productIds[0] !== entry.feedProductId) {
          entry = await api.patch<FeedingEntryDto>(`/feeding-entries/${entry.id}`, {
            feedProductId: productIds[0],
          });
        }
        await persistMeals(entry, filled);
      }

      await queryClient.invalidateQueries({
        queryKey: ['feeding-entry-by-date', selectedPondId, feedingDate],
      });
      const refreshed = await refetchEntry();
      const latest = refreshed.data || entry;
      if (latest) {
        queryClient.setQueryData(['feeding-entry-by-date', selectedPondId, feedingDate], latest);
        setFeedProductId(latest.feedProductId);
        setSelectedCodeIds(codeIdsFromEntry(latest));
        setRows(rowsFromEntry(latest));
      }

      await queryClient.invalidateQueries({ queryKey: ['pond-status', selectedFarmId] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', selectedFarmId] });
      await queryClient.invalidateQueries({ queryKey: ['inventory-summary', selectedFarmId] });
      await queryClient.invalidateQueries({ queryKey: ['inventory-entries', selectedFarmId] });
      setSaveOk(true);
      setMode('view');
    } catch (err) {
      setSaveError(readError(err, t('common.error')));
    } finally {
      setSaving(false);
    }
  };

  if (!selectedPondId) {
    return (
      <AppShell
        title={t('feeding.title')}
        onBack={() => navigate(isOwner ? '/dashboard' : '/')}
      >
        <div className="px-4 py-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-text-secondary">{t('tanks.tapToOpen')}</p>
            <AddTankButton compact onCreated={(pond) => handleTankPick(pond.id)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {ponds?.map((pond) => (
              <div
                key={pond.id}
                className="relative card text-left min-h-[88px] border-2 border-primary/30 bg-primary-light/40"
              >
                <button
                  type="button"
                  onClick={() => handleTankPick(pond.id)}
                  className="w-full h-full p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-2 pr-7">
                    <h3 className="text-base font-bold text-primary">{pond.name}</h3>
                    <span className="rounded-md bg-primary text-white text-xs font-bold px-2 py-0.5 shrink-0">
                      #{pond.code}
                    </span>
                  </div>
                </button>
                <div className="absolute top-2 right-2 z-10">
                  <EditTankNameButton pondId={pond.id} name={pond.name} code={pond.code} />
                </div>
              </div>
            ))}
          </div>

          {!ponds?.length && (
            <div className="card space-y-3">
              <p className="text-sm text-text-secondary">{t('tanks.noTanks')}</p>
              <AddTankButton onCreated={(pond) => handleTankPick(pond.id)} />
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t('feeding.title')}
      onBack={goToTankList}
    >
      <div className="px-4 py-3 space-y-3 max-w-lg mx-auto">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToTankList}
            className="flex-1 min-w-0 card py-2.5 px-3 text-left border border-primary/30"
          >
            <p className="text-base font-bold text-primary truncate">
              {selectedPond?.name}
              {selectedPond?.code ? ` (#${selectedPond.code})` : ''}
            </p>
          </button>
          <input
            type="date"
            value={feedingDate}
            max={todayISO}
            onChange={(e) => handleDateChange(e.target.value)}
            className="input-compact !w-[118px] !py-1.5 !px-2 !text-xs shrink-0"
            aria-label={t('feeding.selectDate')}
          />
          {isOwner && (
            <button
              type="button"
              onClick={openTankReport}
              className="btn-secondary btn-inline !p-2 !min-h-0 !min-w-0 shrink-0 flex items-center justify-center"
              aria-label={t('feeding.tankReport')}
              title={t('feeding.tankReport')}
            >
              <BarChart3 size={16} />
            </button>
          )}
        </div>

        {hasSavedEntry && mode !== 'view' && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={cancelEditing}
              className="btn-secondary btn-inline !text-xs !py-1.5 !px-3 !min-h-0"
            >
              {t('common.cancel')}
            </button>
          </div>
        )}

        {!canEdit && <RecordLockNotice />}

        <div className="space-y-2 pb-32">
          <div className="flex items-center gap-2 px-0.5">
            <div className="grid flex-1 grid-cols-[68px_1fr_minmax(0,1.05fr)] gap-2 text-[11px] font-medium text-text-secondary">
              <span>{t('feeding.feedCode')}</span>
              <span>{t('feeding.quantity')}</span>
              <span>{t('feeding.time')}</span>
            </div>
            {canEdit && hasSavedEntry && mode === 'view' && (
              <button
                type="button"
                onClick={startEditing}
                className="btn-secondary btn-inline !text-xs !py-1 !px-2 !min-h-0 flex items-center gap-1 shrink-0"
              >
                <Pencil size={13} />
                {t('common.edit')}
              </button>
            )}
          </div>

          {rows.map((row, index) => {
            const isSavedRow = !!row.mealId;
            const isViewMode = (hasSavedEntry && mode === 'view') || !canEdit;
            const isAddLockedRow = mode === 'add' && isSavedRow;
            const rowEditable = canEdit && !isViewMode && !isAddLockedRow;
            const showReadonly = isViewMode || isAddLockedRow;
            const rowFeedCode =
              sortedFeedProducts?.find((fp) => fp.id === row.feedProductId)?.feedCode ||
              activeEntry?.meals.find((m) => m.id === row.mealId)?.feedCode ||
              feedCodeLabel;
            const showFeedCodePicker = !showReadonly && !!sortedFeedProducts?.length;
            const canDeleteRow = rowEditable && !row.mealId && (hasSavedEntry || rows.filter((r) => !r.mealId).length > 1);
            const feedLabel = t('feeding.feedLabel', { number: index + 1 });

            return (
              <div key={row.key} className="rounded-lg border border-border bg-surface p-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2 px-0.5">
                  <p className="text-xs font-semibold text-primary">{feedLabel}</p>
                  {canDeleteRow && (
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      className="min-h-0 min-w-0 w-6 h-6 flex items-center justify-center rounded-md border border-border text-text-secondary hover:text-danger hover:border-danger/40"
                      aria-label={t('feeding.removeFeed')}
                    >
                      <Minus size={14} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-[68px_1fr_minmax(0,1.05fr)] gap-2 items-center">
                  {showReadonly ? (
                    <>
                      <span className="text-sm font-semibold text-primary px-1">{rowFeedCode}</span>
                      <span className="text-sm font-semibold px-1">{formatQty(row.quantity)}</span>
                      <span className="text-sm font-semibold px-1">{row.hour} {row.ampm}</span>
                    </>
                  ) : (
                    <>
                      {showFeedCodePicker ? (
                        <FeedCodeCheckboxDropdown
                          products={sortedFeedProducts!}
                          selectedCodeIds={selectedCodeIds}
                          rowProductId={row.feedProductId || resolvedFeedProductId}
                          disabled={!rowEditable}
                          onToggleCode={(productId, assignRow) =>
                            toggleFeedCode(productId, assignRow ? row.key : undefined)
                          }
                          onAssignRow={(productId) => updateRow(row.key, { feedProductId: productId })}
                        />
                      ) : (
                        <span className="text-sm font-semibold text-primary px-1">{rowFeedCode}</span>
                      )}

                      <div className="relative min-w-0">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.quantity}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '' || /^\d*\.?\d{0,3}$/.test(v)) {
                              updateRow(row.key, { quantity: v });
                            }
                          }}
                          disabled={!rowEditable}
                          className="input-compact w-full !py-2 !pl-2 !pr-[3.25rem] !text-sm font-semibold disabled:opacity-60"
                          placeholder="0"
                        />
                        <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                          <div className="relative flex items-center">
                            <select
                              value={row.quantityUnit}
                              onChange={(e) => {
                                const nextUnit = e.target.value as QuantityUnit;
                                updateRow(row.key, {
                                  quantityUnit: nextUnit,
                                  quantity: convertQuantityUnit(row.quantity, row.quantityUnit, nextUnit),
                                });
                              }}
                              disabled={!rowEditable}
                              aria-label={t('feeding.quantityUnit')}
                              className="appearance-none bg-transparent border-0 py-0 pl-0 pr-3.5 text-[11px] font-semibold text-text-secondary cursor-pointer focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <option value="kg">{t('common.kg')}</option>
                              <option value="ton">{t('common.ton')}</option>
                            </select>
                            <ChevronDown
                              size={12}
                              className="absolute right-0 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 min-w-0">
                        <select
                          value={row.hour}
                          onChange={(e) => updateRow(row.key, { hour: e.target.value })}
                          disabled={!rowEditable}
                          className="input-compact flex-1 min-w-0 !py-2 !px-1 !text-sm text-center disabled:opacity-60"
                        >
                          {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <select
                          value={row.ampm}
                          onChange={(e) => updateRow(row.key, { ampm: e.target.value as 'AM' | 'PM' })}
                          disabled={!rowEditable}
                          className="input-compact w-12 !py-2 !px-0.5 !text-xs font-semibold text-center disabled:opacity-60"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {canEdit && (
            <button
              type="button"
              onClick={addRow}
              className="btn-secondary btn-inline flex items-center gap-1.5 !text-sm !py-2"
            >
              <Plus size={14} />
              {t('feeding.addFeed')}
            </button>
          )}
        </div>

        <div className="sticky bottom-0 z-10 bg-background pt-2 pb-3 space-y-1.5 -mx-4 px-4 border-t border-border/60">
          {saveError && <p className="text-danger text-xs">{saveError}</p>}
          {saveOk && <p className="text-success text-xs font-medium">{t('feeding.saved')}</p>}

          <div className="flex items-stretch gap-2">
            <div className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-text-secondary">{dayTotalLabel}</span>
              <span className="font-bold text-base">{formatQty(dayTotal)}</span>
            </div>
            {canEdit && isFormActive && (
              <button
                type="button"
                onClick={() => void handleSaveAll()}
                disabled={saving || !rows.some((r) => formatFeedQtyKg(r.quantity, r.quantityUnit))}
                className="btn-primary btn-inline !py-2"
              >
                {saving ? t('common.loading') : t('common.save')}
              </button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
