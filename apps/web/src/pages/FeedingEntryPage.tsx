import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Pencil, ChevronDown, Minus, BarChart3, Copy } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { AddTankButton } from '@/components/AddTankButton';
import { TankRowList, pondsToTankRows } from '@/components/TankRowList';
import { FeedCodeCheckboxDropdown } from '@/components/FeedCodeCheckboxDropdown';
import { RecordLockNotice } from '@/components/RecordLockNotice';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/roles';
import { api, ApiError } from '@/lib/api';
import { saveFeedingLocally } from '@/lib/sync';
import {
  getTodayISO,
  addDaysISO,
  formatQty,
  formatShortDate,
  getDefaultMealTime,
  from24HourTime,
  to24HourTime,
  formatFeedQtyKg,
  convertQuantityUnit,
  quantityToKg,
  formatTankCode,
  isSupervisorEditableDate,
  type QuantityUnit,
} from '@/lib/utils';
import type { PondDto, FeedProductDto, FeedingEntryDto, FeedingMealDto } from '@aqualedger/contracts';

const FEED_CODE_ORDER = ['1C', '2C', '20', '3S', '3SP', '3P'];

function sortFeedProducts(products: FeedProductDto[]): FeedProductDto[] {
  return [...products].sort(
    (a, b) => FEED_CODE_ORDER.indexOf(a.feedCode) - FEED_CODE_ORDER.indexOf(b.feedCode),
  );
}

type FeedLine = {
  key: string;
  mealId?: string;
  feedProductId: string;
  quantity: string;
  quantityUnit: QuantityUnit;
};

type FeedSlot = {
  key: string;
  slotNumber: number;
  hour: string;
  ampm: 'AM' | 'PM';
  lines: FeedLine[];
};

type FlatFeedRow = {
  key: string;
  mealId?: string;
  mealNumber: number;
  feedProductId: string;
  quantity: string;
  quantityUnit: QuantityUnit;
  hour: string;
  ampm: 'AM' | 'PM';
};

function defaultLine(feedProductId = ''): FeedLine {
  return { key: uuidv4(), feedProductId, quantity: '', quantityUnit: 'kg' };
}

function defaultSlot(slotNumber = 1, feedProductId = ''): FeedSlot {
  const { hour, ampm } = from24HourTime(getDefaultMealTime());
  return {
    key: uuidv4(),
    slotNumber,
    hour,
    ampm,
    lines: [defaultLine(feedProductId)],
  };
}

function slotsFromEntry(entry: FeedingEntryDto): FeedSlot[] {
  if (!entry.meals.length) return [];
  const sorted = [...entry.meals].sort((a, b) => a.mealNumber - b.mealNumber);
  const slots: FeedSlot[] = [];
  const timeIndex = new Map<string, FeedSlot>();

  for (const meal of sorted) {
    const time = meal.actualTime || getDefaultMealTime();
    let slot = timeIndex.get(time);
    if (!slot) {
      const { hour, ampm } = from24HourTime(time);
      slot = {
        key: uuidv4(),
        slotNumber: slots.length + 1,
        hour,
        ampm,
        lines: [],
      };
      timeIndex.set(time, slot);
      slots.push(slot);
    }
    slot.lines.push({
      key: meal.id,
      mealId: meal.id,
      feedProductId: meal.feedProductId || entry.feedProductId,
      quantity: meal.feedQuantityKg,
      quantityUnit: 'kg',
    });
  }

  return slots.map((slot, index) => ({ ...slot, slotNumber: index + 1 }));
}

function slotsFromCopiedEntry(
  sourceEntry: FeedingEntryDto,
  targetEntry?: FeedingEntryDto | null,
): FeedSlot[] {
  if (!sourceEntry.meals.length) return [];
  const targetByTime = new Map<string, FeedingMealDto[]>();
  if (targetEntry?.meals.length) {
    for (const meal of targetEntry.meals) {
      const time = meal.actualTime || getDefaultMealTime();
      const list = targetByTime.get(time) ?? [];
      list.push(meal);
      targetByTime.set(time, list);
    }
  }

  const slots: FeedSlot[] = [];
  const timeIndex = new Map<string, FeedSlot>();

  for (const meal of [...sourceEntry.meals].sort((a, b) => a.mealNumber - b.mealNumber)) {
    const time = meal.actualTime || getDefaultMealTime();
    let slot = timeIndex.get(time);
    if (!slot) {
      const { hour, ampm } = from24HourTime(time);
      slot = {
        key: uuidv4(),
        slotNumber: slots.length + 1,
        hour,
        ampm,
        lines: [],
      };
      timeIndex.set(time, slot);
      slots.push(slot);
    }
    const targetMeals = targetByTime.get(time);
    const targetMeal = targetMeals?.shift();
    slot.lines.push({
      key: targetMeal?.id ?? uuidv4(),
      mealId: targetMeal?.id,
      feedProductId: meal.feedProductId || sourceEntry.feedProductId,
      quantity: meal.feedQuantityKg,
      quantityUnit: 'kg',
    });
  }

  return slots.map((slot, index) => ({ ...slot, slotNumber: index + 1 }));
}

function flattenFilledSlots(slots: FeedSlot[]): FlatFeedRow[] {
  const filled: FlatFeedRow[] = [];
  let mealNumber = 0;

  for (const slot of slots) {
    for (const line of slot.lines) {
      const quantity = formatFeedQtyKg(line.quantity, line.quantityUnit);
      if (!quantity) continue;
      mealNumber += 1;
      filled.push({
        key: line.key,
        mealId: line.mealId,
        mealNumber,
        feedProductId: line.feedProductId,
        quantity,
        quantityUnit: 'kg',
        hour: slot.hour,
        ampm: slot.ampm,
      });
    }
  }

  return filled;
}

function slotHasQuantity(slot: FeedSlot): boolean {
  return slot.lines.some((line) => formatFeedQtyKg(line.quantity, line.quantityUnit));
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
  const [slots, setSlots] = useState<FeedSlot[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [mode, setMode] = useState<'view' | 'add' | 'edit'>('view');
  const [copyingFeed, setCopyingFeed] = useState(false);
  const [copySourceDate, setCopySourceDate] = useState(() => addDaysISO(getTodayISO(), -1));
  const [copyFeedback, setCopyFeedback] = useState<{ type: 'success' | 'info'; text: string } | null>(
    null,
  );

  const copyDateInputRef = useRef<HTMLInputElement>(null);
  const copiedDraftRef = useRef(false);
  const lastCopyPickRef = useRef('');
  const lastCopyTimeRef = useRef(0);
  const copyPickerActiveRef = useRef(false);

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
      setSlots(slotsFromEntry(entryById));
      setMode('view');
    }
  }, [entryById]);

  const { data: pondStatuses } = useQuery({
    queryKey: ['pond-status', selectedFarmId],
    queryFn: () =>
      api.get<import('@aqualedger/contracts').PondTodayStatusDto[]>(
        `/dashboard/pond-status?farmId=${selectedFarmId}`,
      ),
    enabled: !!selectedFarmId && !selectedPondId && !entryId,
  });

  const pondStatusById = useMemo(() => {
    const map = new Map<string, import('@aqualedger/contracts').PondTodayStatusDto>();
    for (const status of pondStatuses ?? []) {
      map.set(status.pondId, status);
    }
    return map;
  }, [pondStatuses]);

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
    copiedDraftRef.current = false;
    lastCopyPickRef.current = '';
  }, [feedingDate, selectedPondId]);

  useEffect(() => {
    if (entryId) return;
    if (!selectedPondId || !selectedFarmId || !entryLoaded) return;
    if (!existingEntry) return;
    if (copiedDraftRef.current) return;

    setSlots(slotsFromEntry(existingEntry));
    setFeedProductId(existingEntry.feedProductId);
    setMode('view');
  }, [existingEntry, entryId, entryLoaded, selectedPondId, selectedFarmId, feedingDate]);

  useEffect(() => {
    if (entryId) return;
    if (!selectedPondId || !selectedFarmId || !entryLoaded || existingEntry) return;
    if (!sortedFeedProducts?.length) return;
    if (copiedDraftRef.current) return;

    setSlots([]);
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
  const canEditDate = isSupervisorEditableDate(feedingDate);
  const canEdit = isOwner || (activeEntry?.isEditable ?? canEditDate);
  const hasPersistedMeals =
    slots.some((slot) => slot.lines.some((line) => line.mealId)) ||
    (activeEntry?.meals.length ?? 0) > 0 ||
    parseFloat(activeEntry?.totalDailyFeedKg ?? '0') > 0;
  const hasSavedEntry = hasPersistedMeals;
  const isFormActive = !hasSavedEntry || mode !== 'view';
  const feedCodeLabel =
    sortedFeedProducts?.find((fp) => fp.id === resolvedFeedProductId)?.feedCode ||
    activeEntry?.feedCode ||
    '—';

  const dayTotal = useMemo(() => {
    const rowTotal = slots.reduce(
      (sum, slot) =>
        sum + slot.lines.reduce((lineSum, line) => lineSum + quantityToKg(line.quantity, line.quantityUnit), 0),
      0,
    );
    if (rowTotal > 0) return rowTotal.toFixed(1);
    return activeEntry?.totalDailyFeedKg || '0';
  }, [slots, activeEntry]);

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
    setCopySourceDate(addDaysISO(value, -1));
    setSaveError(null);
    setSaveOk(false);
    setCopyFeedback(null);
  };

  useEffect(() => {
    if (copySourceDate === feedingDate) {
      setCopySourceDate(addDaysISO(feedingDate, -1));
    }
  }, [feedingDate, copySourceDate]);

  const openTankReport = () => {
    navigate(`/reports?pondId=${selectedPondId}&from=feeding`);
  };

  const dayTotalLabel =
    feedingDate === todayISO
      ? t('feeding.todayTotal')
      : t('feeding.dayTotal', { date: formatShortDate(feedingDate) });

  const previousFeedingDate = addDaysISO(feedingDate, -1);
  const showCopyFeed = !!selectedFarmId && !!selectedPondId;
  const canUseCopyFeed = canEdit && !copyingFeed;

  const handleCopyFromDate = async (sourceDate: string) => {
    if (!selectedFarmId || !selectedPondId || copyingFeed) return;
    if (!sourceDate || sourceDate > todayISO || sourceDate === feedingDate) {
      setCopyFeedback({ type: 'info', text: t('feeding.sameDateCopyError') });
      return;
    }
    setCopyingFeed(true);
    setCopyFeedback(null);
    setSaveError(null);
    setSaveOk(false);
    try {
      const sourceEntry = await fetchEntryForDate(selectedFarmId, selectedPondId, sourceDate);
      if (!sourceEntry?.meals.length) {
        setCopyFeedback({
          type: 'info',
          text: t('feeding.noPreviousEntry', { date: formatShortDate(sourceDate) }),
        });
        return;
      }
      const copiedSlots = slotsFromCopiedEntry(sourceEntry, activeEntry);
      copiedDraftRef.current = true;
      setSlots(copiedSlots);
      setFeedProductId(sourceEntry.feedProductId);
      setMode(hasSavedEntry ? 'edit' : 'add');
      setCopyFeedback({
        type: 'success',
        text: t('feeding.copiedPreviousEntry', { date: formatShortDate(sourceDate) }),
      });
    } catch (err) {
      setCopyFeedback({ type: 'info', text: readError(err, t('common.error')) });
    } finally {
      setCopyingFeed(false);
    }
  };

  const handleCopyPreviousDay = () => {
    setCopySourceDate(previousFeedingDate);
    void handleCopyFromDate(previousFeedingDate);
  };

  const handleCopyDateSelected = (value: string, options?: { force?: boolean }) => {
    if (!value || value > todayISO) return;
    if (value === feedingDate) {
      setCopyFeedback({ type: 'info', text: t('feeding.sameDateCopyError') });
      return;
    }
    const now = Date.now();
    if (
      !options?.force &&
      lastCopyPickRef.current === value &&
      now - lastCopyTimeRef.current < 800
    ) {
      return;
    }
    lastCopyPickRef.current = value;
    lastCopyTimeRef.current = now;
    setCopySourceDate(value);
    setCopyFeedback(null);
    void handleCopyFromDate(value);
  };

  const handleCopyDateSelectedRef = useRef(handleCopyDateSelected);
  handleCopyDateSelectedRef.current = handleCopyDateSelected;

  const handleCopyDateInput = (event: React.FormEvent<HTMLInputElement>) => {
    handleCopyDateSelected(event.currentTarget.value);
  };

  const handleCopyDateFocus = () => {
    copyPickerActiveRef.current = true;
    lastCopyPickRef.current = '';
  };

  const handleCopyDateBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (!copyPickerActiveRef.current) return;
    copyPickerActiveRef.current = false;
    const value = event.currentTarget.value;
    if (value) handleCopyDateSelected(value, { force: true });
  };

  useEffect(() => {
    const input = copyDateInputRef.current;
    if (!input) return;
    const onNativeChange = () => {
      if (input.value) handleCopyDateSelectedRef.current(input.value);
    };
    input.addEventListener('change', onNativeChange);
    return () => input.removeEventListener('change', onNativeChange);
  }, [feedingDate, selectedPondId]);

  const startEditing = () => {
    setMode('edit');
    setSaveError(null);
    setSaveOk(false);
  };

  const cancelEditing = () => {
    setMode('view');
    setSaveError(null);
    setSaveOk(false);
    if (activeEntry) {
      setFeedProductId(activeEntry.feedProductId);
      setSlots(slotsFromEntry(activeEntry));
    }
  };

  const updateSlot = (slotKey: string, patch: Partial<Pick<FeedSlot, 'hour' | 'ampm'>>) => {
    setSlots((current) =>
      current.map((slot) => (slot.key === slotKey ? { ...slot, ...patch } : slot)),
    );
    setSaveError(null);
    setSaveOk(false);
  };

  const updateLine = (slotKey: string, lineKey: string, patch: Partial<FeedLine>) => {
    setSlots((current) =>
      current.map((slot) => {
        if (slot.key !== slotKey) return slot;
        return {
          ...slot,
          lines: slot.lines.map((line) => (line.key === lineKey ? { ...line, ...patch } : line)),
        };
      }),
    );
    setSaveError(null);
    setSaveOk(false);
  };

  const pickDefaultProductId = (usedIds: Set<string>) =>
    sortedFeedProducts?.find((product) => !usedIds.has(product.id))?.id ||
    sortedFeedProducts?.find((fp) => fp.feedCode === '1C')?.id ||
    sortedFeedProducts?.[0]?.id ||
    resolvedFeedProductId;

  const addSlot = () => {
    if (hasSavedEntry && mode === 'view') {
      setMode('edit');
      setSaveError(null);
      setSaveOk(false);
    }
    const nextNumber = Math.max(0, ...slots.map((slot) => slot.slotNumber)) + 1;
    const usedIds = new Set(
      slots.flatMap((slot) => slot.lines.map((line) => line.feedProductId).filter(Boolean)),
    );
    setSlots((current) => [...current, defaultSlot(nextNumber, pickDefaultProductId(usedIds))]);
  };

  const addLineToSlot = (slotKey: string) => {
    setSlots((current) =>
      current.map((slot) => {
        if (slot.key !== slotKey) return slot;
        const usedIds = new Set(slot.lines.map((line) => line.feedProductId).filter(Boolean));
        return {
          ...slot,
          lines: [...slot.lines, defaultLine(pickDefaultProductId(usedIds))],
        };
      }),
    );
    setSaveError(null);
    setSaveOk(false);
  };

  const removeLine = (slotKey: string, lineKey: string) => {
    if (mode === 'view') return;
    if (hasSavedEntry && mode !== 'edit') return;
    setSlots((current) => {
      const next = current
        .map((slot) => {
          if (slot.key !== slotKey) return slot;
          const lines = slot.lines.filter((line) => line.key !== lineKey);
          return lines.length ? { ...slot, lines } : null;
        })
        .filter((slot): slot is FeedSlot => slot !== null)
        .map((slot, index) => ({ ...slot, slotNumber: index + 1 }));
      return next;
    });
    setSaveError(null);
    setSaveOk(false);
  };

  const removeSlot = (slotKey: string) => {
    if (mode === 'view') return;
    if (hasSavedEntry && mode !== 'edit') return;
    setSlots((current) =>
      current
        .filter((slot) => slot.key !== slotKey)
        .map((slot, index) => ({ ...slot, slotNumber: index + 1 })),
    );
    setSaveError(null);
    setSaveOk(false);
  };

  const ensurePondReady = async (): Promise<PondDto> => {
    await api.post(`/ponds/${selectedPondId}/culture-cycle`, { stockingDate: feedingDate });
    const fresh = await queryClient.fetchQuery({
      queryKey: ['ponds', selectedFarmId],
      queryFn: () => api.get<PondDto[]>(`/farms/${selectedFarmId}/ponds`),
    });
    const pond = fresh?.find((p) => p.id === selectedPondId);
    if (!pond?.activeCycle) {
      throw new ApiError(400, t('feeding.noActiveCycle'));
    }
    return pond;
  };

  const clearAllMeals = async (entry: FeedingEntryDto) =>
    api.post<{ cleared: true }>(`/feeding-entries/${entry.id}/clear-meals`);

  const syncMeals = async (entry: FeedingEntryDto, filled: FlatFeedRow[]) =>
    api.put<FeedingEntryDto | null>(`/feeding-entries/${entry.id}/meals`, {
      meals: filled.map((row) => ({
        id: row.mealId,
        feedQuantityKg: row.quantity,
        feedProductId: row.feedProductId || resolvedFeedProductId,
        actualTime: to24HourTime(row.hour, '00', row.ampm),
      })),
    });

  const isEditingRows = mode === 'edit' || (mode === 'add' && !hasSavedEntry);
  const hasRowQuantity = slots.some((slot) => slotHasQuantity(slot));
  const clearingEntry = slots.length === 0 && !!activeEntry && mode === 'edit';
  const canSave = hasRowQuantity || clearingEntry;

  const applySavedEntryState = (latest: FeedingEntryDto | null | undefined) => {
    copiedDraftRef.current = false;
    lastCopyPickRef.current = '';
    if (latest) {
      queryClient.setQueryData(['feeding-entry-by-date', selectedPondId, feedingDate], latest);
      setFeedProductId(latest.feedProductId);
      setSlots(slotsFromEntry(latest));
      setMode('view');
      return;
    }

    queryClient.setQueryData(['feeding-entry-by-date', selectedPondId, feedingDate], null);
    const defaultId =
      sortedFeedProducts?.find((fp) => fp.feedCode === '1C')?.id || sortedFeedProducts?.[0]?.id || '';
    setSlots([]);
    setFeedProductId(defaultId);
    setMode('add');
  };

  const handleSaveAll = async () => {
    if (!selectedFarmId) return;

    const filled = flattenFilledSlots(slots);

    if (!filled.length && !hasSavedEntry && !activeEntry) return;
    if (filled.length && !resolvedFeedProductId) {
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

      if (!filled.length) {
        if (!entry) {
          setSaveError(t('feeding.noMealsYet'));
          return;
        }
        await clearAllMeals(entry);
        await queryClient.invalidateQueries({
          queryKey: ['feeding-entry-by-date', selectedPondId, feedingDate],
        });
        const refreshed = await refetchEntry();
        applySavedEntryState(refreshed.data);
        await queryClient.invalidateQueries({ queryKey: ['pond-status', selectedFarmId] });
        await queryClient.invalidateQueries({ queryKey: ['dashboard', selectedFarmId] });
        await queryClient.invalidateQueries({ queryKey: ['inventory-summary', selectedFarmId] });
        await queryClient.invalidateQueries({ queryKey: ['inventory-entries', selectedFarmId] });
        setSaveOk(true);
        setCopyFeedback(null);
        return;
      }

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
            if (entry) entry = await syncMeals(entry, filled);
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
        entry = await syncMeals(entry, filled);
      }

      await queryClient.invalidateQueries({
        queryKey: ['feeding-entry-by-date', selectedPondId, feedingDate],
      });
      const refreshed = await refetchEntry();
      applySavedEntryState(refreshed.data);
      await queryClient.invalidateQueries({ queryKey: ['pond-status', selectedFarmId] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', selectedFarmId] });
      await queryClient.invalidateQueries({ queryKey: ['inventory-summary', selectedFarmId] });
      await queryClient.invalidateQueries({ queryKey: ['inventory-entries', selectedFarmId] });
      setSaveOk(true);
      setCopyFeedback(null);
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

          <TankRowList
            tanks={pondsToTankRows(ponds ?? [], pondStatusById)}
            onSelect={handleTankPick}
          />

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
              {selectedPond?.code ? ` (${formatTankCode(selectedPond.code)})` : ''}
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

        {showCopyFeed && (
          <div className="space-y-1">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopyPreviousDay}
                disabled={!canUseCopyFeed}
                aria-label={t('feeding.copyPreviousDayHint', { date: formatShortDate(previousFeedingDate) })}
                className="btn-secondary flex-1 flex items-center justify-center gap-1 !text-[11px] !py-2 !px-2 !min-h-0 whitespace-nowrap disabled:opacity-50"
              >
                <Copy size={13} className="shrink-0" />
                {copyingFeed ? t('common.loading') : t('feeding.copyPreviousDay')}
              </button>
              <label
                className={`btn-secondary flex-1 relative flex items-center justify-center gap-1 !text-[11px] !py-2 !px-2 !min-h-0 whitespace-nowrap overflow-hidden ${canUseCopyFeed ? 'cursor-pointer' : 'opacity-50 pointer-events-none'}`}
              >
                <Copy size={13} className="shrink-0 pointer-events-none" />
                <span className="pointer-events-none">{t('feeding.copyFromDate')}</span>
                <input
                  ref={copyDateInputRef}
                  type="date"
                  key={`copy-source-${feedingDate}`}
                  defaultValue={copySourceDate}
                  max={todayISO}
                  disabled={!canUseCopyFeed}
                  onFocus={handleCopyDateFocus}
                  onBlur={handleCopyDateBlur}
                  onChange={handleCopyDateInput}
                  onInput={handleCopyDateInput}
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-[0.01] !text-base disabled:cursor-not-allowed"
                  aria-label={t('feeding.copyFromDateHint')}
                />
              </label>
            </div>
            {copyFeedback && (
              <p
                className={`text-xs text-center ${copyFeedback.type === 'success' ? 'text-success font-medium' : 'text-text-secondary'}`}
                role="status"
              >
                {copyFeedback.text}
              </p>
            )}
          </div>
        )}

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

          {slots.length === 0 && (
            <p className="text-sm text-text-secondary text-center py-6">{t('feeding.noMealsYet')}</p>
          )}

          {slots.map((slot) => {
            const isViewMode = (hasSavedEntry && mode === 'view') || !canEdit;
            const slotHasSavedLines = slot.lines.some((line) => line.mealId);
            const isAddLockedSlot = mode === 'add' && slotHasSavedLines;
            const slotEditable = canEdit && !isViewMode && !isAddLockedSlot;
            const showReadonly = isViewMode || isAddLockedSlot;
            const showFeedCodePicker = !showReadonly && !!sortedFeedProducts?.length;
            const canDeleteSlot = canEdit && isEditingRows;
            const feedLabel = t('feeding.feedLabel', { number: slot.slotNumber });

            return (
              <div key={slot.key} className="rounded-lg border border-border bg-surface p-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2 px-0.5">
                  <p className="text-xs font-semibold text-primary">{feedLabel}</p>
                  {canDeleteSlot && (
                    <button
                      type="button"
                      onClick={() => removeSlot(slot.key)}
                      className="min-h-0 min-w-0 w-7 h-7 flex items-center justify-center rounded-md border border-danger/30 bg-danger/5 text-danger hover:bg-danger/10 hover:border-danger/50"
                      aria-label={t('feeding.removeFeed')}
                    >
                      <Minus size={15} strokeWidth={2.5} />
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {slot.lines.map((line, lineIndex) => {
                    const lineFeedCode =
                      sortedFeedProducts?.find((fp) => fp.id === line.feedProductId)?.feedCode ||
                      activeEntry?.meals.find((m) => m.id === line.mealId)?.feedCode ||
                      feedCodeLabel;
                    const canRemoveLine = slotEditable && slot.lines.length > 1;
                    const isFirstLine = lineIndex === 0;

                    return (
                      <div
                        key={line.key}
                        className="grid grid-cols-[68px_1fr_minmax(0,1.05fr)] gap-2 items-center"
                      >
                        {showReadonly ? (
                          <>
                            <span className="text-sm font-semibold text-primary px-1">{lineFeedCode}</span>
                            <span className="text-sm font-semibold px-1">{formatQty(line.quantity)}</span>
                            <span className="text-sm font-semibold px-1">
                              {isFirstLine ? `${slot.hour} ${slot.ampm}` : ''}
                            </span>
                          </>
                        ) : (
                          <>
                            {showFeedCodePicker ? (
                              <FeedCodeCheckboxDropdown
                                products={sortedFeedProducts!}
                                rowProductId={line.feedProductId}
                                disabled={!slotEditable}
                                onSelectCode={(productId) =>
                                  updateLine(slot.key, line.key, { feedProductId: productId })
                                }
                              />
                            ) : (
                              <span className="text-sm font-semibold text-primary px-1">{lineFeedCode}</span>
                            )}

                            <div className="relative min-w-0">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={line.quantity}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === '' || /^\d*\.?\d{0,3}$/.test(v)) {
                                    updateLine(slot.key, line.key, { quantity: v });
                                  }
                                }}
                                disabled={!slotEditable}
                                className="input-compact w-full !py-2 !pl-2 !pr-[3.25rem] !text-sm font-semibold disabled:opacity-60"
                                placeholder="0"
                              />
                              <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                                <div className="relative flex items-center">
                                  <select
                                    value={line.quantityUnit}
                                    onChange={(e) => {
                                      const nextUnit = e.target.value as QuantityUnit;
                                      updateLine(slot.key, line.key, {
                                        quantityUnit: nextUnit,
                                        quantity: convertQuantityUnit(
                                          line.quantity,
                                          line.quantityUnit,
                                          nextUnit,
                                        ),
                                      });
                                    }}
                                    disabled={!slotEditable}
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

                            {isFirstLine ? (
                              <div className="flex items-center gap-1 min-w-0">
                                <select
                                  value={slot.hour}
                                  onChange={(e) => updateSlot(slot.key, { hour: e.target.value })}
                                  disabled={!slotEditable}
                                  className="input-compact flex-1 min-w-0 !py-2 !px-1 !text-sm text-center disabled:opacity-60"
                                >
                                  {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => (
                                    <option key={h} value={h}>{h}</option>
                                  ))}
                                </select>
                                <select
                                  value={slot.ampm}
                                  onChange={(e) =>
                                    updateSlot(slot.key, { ampm: e.target.value as 'AM' | 'PM' })
                                  }
                                  disabled={!slotEditable}
                                  className="input-compact w-12 !py-2 !px-0.5 !text-xs font-semibold text-center disabled:opacity-60"
                                >
                                  <option value="AM">AM</option>
                                  <option value="PM">PM</option>
                                </select>
                              </div>
                            ) : canRemoveLine ? (
                              <button
                                type="button"
                                onClick={() => removeLine(slot.key, line.key)}
                                className="min-h-0 min-w-0 w-7 h-7 flex items-center justify-center rounded-md border border-danger/30 bg-danger/5 text-danger hover:bg-danger/10 hover:border-danger/50 justify-self-end"
                                aria-label={t('feeding.removeCode')}
                              >
                                <Minus size={14} strokeWidth={2.5} />
                              </button>
                            ) : (
                              <span />
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {slotEditable && (
                  <button
                    type="button"
                    onClick={() => addLineToSlot(slot.key)}
                    className="btn-secondary btn-inline flex items-center gap-1 !text-[11px] !py-1 !px-2 !min-h-0"
                  >
                    <Plus size={12} />
                    {t('feeding.addCode')}
                  </button>
                )}
              </div>
            );
          })}

          {canEdit && (
            <button
              type="button"
              onClick={addSlot}
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
                disabled={saving || !canSave}
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
