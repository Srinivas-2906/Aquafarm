import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import { Plus, ArrowLeft, ScanLine, FileText, X } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { NumericQuantityInput } from '@/components/NumericQuantityInput';
import { RecordLockNotice } from '@/components/RecordLockNotice';
import { ScanSheetModal } from '@/components/ScanSheetModal';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/roles';
import { api } from '@/lib/api';
import { saveFeedingLocally } from '@/lib/sync';
import {
  getTodayISO,
  getYesterdayISO,
  sumKg,
  toKg,
  formatShortDate,
  formatQty,
  getDefaultMealTime,
  calculateDoc,
  addDaysISO,
  type QuantityUnit,
} from '@/lib/utils';
import type { PondDto, FeedProductDto, FeedingEntryDto } from '@aqualedger/contracts';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export function FeedingEntryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { entryId } = useParams();
  const { selectedFarmId, user } = useAuth();
  const queryClient = useQueryClient();

  const { data: entryById } = useQuery({
    queryKey: ['feeding-entry', entryId],
    queryFn: () => api.get<FeedingEntryDto>(`/feeding-entries/${entryId}`),
    enabled: !!entryId,
  });

  const pondIdParam = searchParams.get('pondId');
  const [selectedPondId, setSelectedPondId] = useState(pondIdParam || '');
  const [showAddForm, setShowAddForm] = useState(searchParams.get('add') === 'true');

  useEffect(() => {
    if (entryId) return;

    if (pondIdParam) {
      setSelectedPondId(pondIdParam);
      setShowAddForm(searchParams.get('add') === 'true');
    } else {
      setSelectedPondId('');
      setShowAddForm(false);
    }
  }, [pondIdParam, searchParams, entryId]);

  useEffect(() => {
    if (entryById && !selectedPondId) setSelectedPondId(entryById.pondId);
  }, [entryById, selectedPondId]);

  useEffect(() => {
    if (!showAddForm) return;
    setJustOpenedForm(true);
    const t = window.setTimeout(() => setJustOpenedForm(false), 220);
    return () => window.clearTimeout(t);
  }, [showAddForm]);
  const [quantity, setQuantity] = useState('');
  const [quantityUnit, setQuantityUnit] = useState<QuantityUnit>('kg');
  const [feedingDate, setFeedingDate] = useState(getTodayISO());
  const [mealTime, setMealTime] = useState(getDefaultMealTime);
  const [feedProductId, setFeedProductId] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmLarge, setConfirmLarge] = useState(false);
  const [usualQty, setUsualQty] = useState<string | null>(null);
  const [saved, setSaved] = useState<{
    pondName: string;
    mealNumber: number;
    quantity: string;
    tdf: string;
    status: string;
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justOpenedForm, setJustOpenedForm] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [dailyReportOpen, setDailyReportOpen] = useState(false);
  const [dailyReportLoading, setDailyReportLoading] = useState(false);
  const [dailyReportError, setDailyReportError] = useState<string | null>(null);
  const [dailyReport, setDailyReport] = useState<{
    id: string;
    rows: Array<Record<string, unknown>>;
    summary: { totalEntries: number; periodTotalKg: string };
    downloadUrls: { pdf: string; excel: string };
  } | null>(null);

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

  useEffect(() => {
    if (entryById) setFeedingDate(entryById.feedingDate.split('T')[0]);
  }, [entryById]);

  const isOwner = user?.role === UserRole.OWNER;
  const todayISO = getTodayISO();
  const yesterdayISO = getYesterdayISO();

  const { data: existingEntryForDate, refetch: refetchEntryForDate } = useQuery({
    queryKey: ['feeding-entry-by-date', selectedPondId, feedingDate],
    queryFn: async () => {
      const result = await api.get<{ data: FeedingEntryDto[] }>(
        `/feeding-entries?farmId=${selectedFarmId}&pondId=${selectedPondId}&dateFrom=${feedingDate}&dateTo=${feedingDate}`,
      );
      return result.data[0] || null;
    },
    enabled: !!selectedPondId && !!selectedFarmId && !entryId,
  });

  const existingEntry = entryId ? entryById : existingEntryForDate;

  const priorDateISO = addDaysISO(feedingDate, -1);

  useEffect(() => {
    if (selectedPondId && !showAddForm && !saved) {
      void refetchEntryForDate();
    }
  }, [selectedPondId, showAddForm, saved, feedingDate, refetchEntryForDate]);

  const { data: priorEntry } = useQuery({
    queryKey: ['feeding-prior', selectedPondId, priorDateISO],
    queryFn: async () => {
      const result = await api.get<{ data: FeedingEntryDto[] }>(
        `/feeding-entries?farmId=${selectedFarmId}&pondId=${selectedPondId}&dateFrom=${priorDateISO}&dateTo=${priorDateISO}`,
      );
      return result.data[0] || null;
    },
    enabled: !!selectedPondId && !!selectedFarmId && !existingEntry,
  });

  const suggestedQty =
    existingEntry?.meals[existingEntry.meals.length - 1]?.feedQuantityKg ||
    priorEntry?.meals[priorEntry.meals.length - 1]?.feedQuantityKg ||
    null;

  useEffect(() => {
    if (existingEntry?.feedProductId) {
      setFeedProductId(existingEntry.feedProductId);
    } else if (feedProducts?.length && !feedProductId) {
      setFeedProductId(feedProducts[0].id);
    }
  }, [feedProducts, feedProductId, existingEntry]);

  const nextMealNumber = (existingEntry?.meals.length ?? 0) + 1;
  const currentTdf = existingEntry
    ? sumKg([...existingEntry.meals.map((m) => m.feedQuantityKg), quantity].filter(Boolean))
    : quantity || '0';

  const selectedPond = ponds?.find((p) => p.id === selectedPondId);
  const selectedProduct = feedProducts?.find((p) => p.id === feedProductId);
  const stockingDate = selectedPond?.activeCycle?.stockingDate;
  const displayDoc =
    existingEntry?.doc ??
    (stockingDate ? calculateDoc(stockingDate, feedingDate) : selectedPond?.activeCycle?.doc);
  const displayFeedCode = existingEntry?.feedCode ?? selectedProduct?.feedCode;
  const dateLocked = !!existingEntry;
  const [mealHour, mealMinute] = mealTime.split(':');

  const handleMealHourChange = (hour: string) => {
    setMealTime(`${hour}:${mealMinute || '00'}`);
  };

  const handleMealMinuteChange = (minute: string) => {
    setMealTime(`${mealHour || '00'}:${minute}`);
  };

  const goToTankList = () => {
    setSelectedPondId('');
    setShowAddForm(false);
    setSaved(null);
    setSaveError(null);
    navigate('/feeding/entry');
  };

  const goToTankOverview = () => {
    setShowAddForm(false);
    setSaveError(null);
  };

  const openDailyTankReport = async () => {
    if (!selectedFarmId || !selectedPondId) return;
    setDailyReportOpen(true);
    setDailyReportError(null);
    setDailyReportLoading(true);
    try {
      if (!isOwner) {
        if (!existingEntry) {
          setDailyReportError(t('reports.noData'));
          setDailyReport(null);
          return;
        }
        const mealMap: Record<number, string> = {};
        existingEntry.meals.forEach((m) => {
          mealMap[m.mealNumber] = m.feedQuantityKg?.toString?.() ?? String(m.feedQuantityKg ?? '');
        });
        setDailyReport({
          id: 'local',
          rows: [
            {
              date: existingEntry.feedingDate.split('T')[0],
              doc: existingEntry.doc,
              feedCode: existingEntry.feedCode || displayFeedCode || '—',
              meal1: mealMap[1] || '',
              meal2: mealMap[2] || '',
              meal3: mealMap[3] || '',
              meal4: mealMap[4] || '',
              meal5: mealMap[5] || '',
              tdf: existingEntry.totalDailyFeedKg,
              cumulative: existingEntry.cumulativeFeedKg,
              checkTray: existingEntry.meals
                .map((m) => m.checkTrayRemainingPercentage)
                .filter(Boolean)
                .join(', '),
              remarks: existingEntry.remarks || '',
              pondName: selectedPond?.name || existingEntry.pondName || '',
            },
          ],
          summary: { totalEntries: 1, periodTotalKg: existingEntry.totalDailyFeedKg },
          downloadUrls: { pdf: '', excel: '' },
        });
      } else {
        const res = await api.post<typeof dailyReport>('/reports/generate', {
          farmId: selectedFarmId,
          pondId: selectedPondId,
          dateFrom: feedingDate,
          dateTo: feedingDate,
          reportType: 'FEEDING_DATE_RANGE',
        });
        setDailyReport(res);
      }
    } catch (e) {
      setDailyReportError(e instanceof Error ? e.message : t('common.error'));
      setDailyReport(null);
    } finally {
      setDailyReportLoading(false);
    }
  };

  const downloadDailyReport = (format: 'pdf' | 'excel') => {
    if (!dailyReport) return;
    if (!isOwner || dailyReport.id === 'local') return;
    const token = localStorage.getItem('accessToken');
    window.open(
      `${API_URL}/reports/${dailyReport.id}/download?format=${format}&token=${token}`,
      '_blank',
    );
  };

  const shareDailyReport = async () => {
    if (!dailyReport) return;
    const text = `Feeding Report\nTank: ${selectedPond?.name || ''}\nDate: ${feedingDate}\nTotal: ${dailyReport.summary.periodTotalKg} kg\nEntries: ${dailyReport.summary.totalEntries}`;
    if (navigator.share) {
      await navigator.share({ title: 'Daily Tank Report', text });
    } else {
      await navigator.clipboard.writeText(text);
      alert('Summary copied to clipboard');
    }
  };

  const handleDateChange = (value: string) => {
    if (!value || value > todayISO) return;
    setFeedingDate(value);
  };

  const dayTotalLabel =
    feedingDate === todayISO
      ? t('feeding.todayTotal')
      : feedingDate === yesterdayISO
        ? t('feeding.yesterdayTotal')
        : t('feeding.dayTotal', { date: formatShortDate(feedingDate) });

  const handleSave = async (skipLargeConfirm = false) => {
    const qtyKg = toKg(quantity, quantityUnit);
    if (!qtyKg || parseFloat(qtyKg) <= 0) return;
    if (!selectedPond?.activeCycle) return;

    const lastMealQty = existingEntry?.meals[existingEntry.meals.length - 1]?.feedQuantityKg;
    if (
      lastMealQty &&
      !skipLargeConfirm &&
      parseFloat(qtyKg) > parseFloat(lastMealQty) * 3
    ) {
      setUsualQty(lastMealQty);
      setConfirmLarge(true);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      if (existingEntry) {
        const result = await api.post<FeedingEntryDto>(`/feeding-entries/${existingEntry.id}/meals`, {
          mealNumber: nextMealNumber,
          feedQuantityKg: qtyKg,
          actualTime: mealTime,
        });
        queryClient.setQueryData(
          ['feeding-entry-by-date', selectedPondId, feedingDate],
          result,
        );
        setSaved({
          pondName: selectedPond.name,
          mealNumber: nextMealNumber,
          quantity: qtyKg,
          tdf: result.totalDailyFeedKg,
          status: 'SYNCED',
        });
        await queryClient.invalidateQueries({ queryKey: ['feeding-entry-by-date', selectedPondId, feedingDate] });
        await queryClient.invalidateQueries({ queryKey: ['feeding-entry', entryId] });
        await queryClient.invalidateQueries({ queryKey: ['pond-status', selectedFarmId] });
      } else {
        const clientEntryId = uuidv4();
        const entry = {
          clientEntryId,
          farmId: selectedFarmId,
          pondId: selectedPondId,
          cultureCycleId: selectedPond.activeCycle.id,
          feedingDate,
          feedProductId,
          meals: [
            {
              mealNumber: 1,
              feedQuantityKg: qtyKg,
              actualTime: mealTime,
            },
          ],
          deviceCreatedAt: new Date().toISOString(),
        };

        try {
          const result = await api.post<FeedingEntryDto>('/feeding-entries', entry);
          queryClient.setQueryData(
            ['feeding-entry-by-date', selectedPondId, feedingDate],
            result,
          );
          setSaved({
            pondName: selectedPond.name,
            mealNumber: 1,
            quantity: qtyKg,
            tdf: result.totalDailyFeedKg,
            status: 'SYNCED',
          });
          await queryClient.invalidateQueries({ queryKey: ['feeding-entry-by-date', selectedPondId, feedingDate] });
          await queryClient.invalidateQueries({ queryKey: ['pond-status', selectedFarmId] });
        } catch {
          const local = await saveFeedingLocally(entry, selectedFarmId!);
          setSaved({
            pondName: selectedPond.name,
            mealNumber: 1,
            quantity: qtyKg,
            tdf: qtyKg,
            status: local.localStatus,
          });
          await queryClient.invalidateQueries({ queryKey: ['feeding-entry-by-date', selectedPondId, feedingDate] });
        }
      }
    } catch (err) {
      console.error(err);
      setSaveError(err instanceof Error ? err.message : t('sync.failed'));
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <AppShell title={t('feeding.confirmTitle')} showNav={false}>
        <div className="px-4 py-6 space-y-4 text-center">
          <div className="w-16 h-16 bg-success/20 rounded-full flex items-center justify-center mx-auto">
            <span className="text-success text-3xl">✓</span>
          </div>
          <h2 className="text-xl font-bold">{t('feeding.confirmTitle')}</h2>
          <div className="card text-left space-y-2">
            <p className="font-bold text-lg">{saved.pondName}</p>
            <p>{formatShortDate(feedingDate)} · {mealTime}</p>
            {displayDoc != null && <p>{t('home.doc', { doc: displayDoc })}</p>}
            {displayFeedCode && <p>{t('feeding.feedCode')}: {displayFeedCode}</p>}
            <p>{t('feeding.meal', { number: saved.mealNumber })}: {formatQty(saved.quantity)}</p>
            <p className="font-semibold">{t('feeding.todayTotal')}: {formatQty(saved.tdf)}</p>
            <p className="text-sm text-text-secondary">
              {saved.status === 'SYNCED' ? t('sync.sent') : t('sync.savedOnPhone')}
            </p>
          </div>
          <div className="space-y-2">
            <button onClick={() => { setSaved(null); setQuantity(''); setMealTime(getDefaultMealTime()); setShowAddForm(true); }} className="btn-secondary">
              {t('feeding.addMeal')}
            </button>
            <button onClick={() => { setSaved(null); setShowAddForm(false); setFeedingDate(getTodayISO()); }} className="btn-secondary">
              {t('feeding.viewFeeds')}
            </button>
            <Link to="/feeding/entry" onClick={goToTankList} className="btn-secondary block text-center">
              {t('feeding.addAnotherTank')}
            </Link>
            <button onClick={() => navigate('/')} className="btn-primary">
              {t('feeding.backHome')}
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (entryId && !selectedPondId) {
    return (
      <AppShell showNav={false}>
        <p className="text-center text-text-secondary py-8">{t('common.loading')}</p>
      </AppShell>
    );
  }

  if (!selectedPondId) {
    return (
      <AppShell title={t('feeding.selectTank')}>
        <div className="px-4 py-4 space-y-3">
          {ponds?.map((pond) => (
            <button
              key={pond.id}
              onClick={() => navigate(`/feeding/entry?pondId=${pond.id}`)}
              className="card w-full text-left min-h-touch"
            >
              <h3 className="text-xl font-bold text-primary">{pond.name}</h3>
              {pond.activeCycle && (
                <p className="text-sm text-text-secondary">
                  DOC {pond.activeCycle.doc} — {pond.activeCycle.species}
                </p>
              )}
            </button>
          ))}
        </div>
      </AppShell>
    );
  }

  if (selectedPondId && !showAddForm) {
    const overviewDoc =
      existingEntry?.doc ??
      (stockingDate ? calculateDoc(stockingDate, feedingDate) : selectedPond?.activeCycle?.doc);
    const overviewFeedCode = existingEntry?.feedCode ?? selectedProduct?.feedCode;

    return (
      <AppShell title={selectedPond?.name || t('feeding.selectTank')} showNav={false}>
        <div className="px-4 py-4 space-y-4 overflow-x-hidden">
          <button
            type="button"
            onClick={goToTankList}
            className="flex items-center gap-1 text-sm text-primary font-medium"
          >
            <ArrowLeft size={18} />
            {t('feeding.changeTank')}
          </button>

          <div className="rounded-xl border border-border bg-primary-light p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-bold text-lg text-primary leading-tight truncate">
                  {selectedPond?.name}
                </h2>
                <div className="text-xs text-text-secondary mt-1">
                  <span className="font-medium text-text-primary">DOC {overviewDoc ?? '—'}</span>
                  <span className="mx-2">•</span>
                  <span>
                    {t('feeding.feedCode')}: <span className="font-medium text-text-primary">{overviewFeedCode ?? '—'}</span>
                  </span>
                </div>
              </div>
              {existingEntry && (
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-text-secondary leading-none">
                    {t('feeding.todayTotal')}
                  </div>
                  <div className="font-bold text-lg text-text-primary leading-tight">
                    {formatQty(existingEntry.totalDailyFeedKg)}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setFeedingDate(todayISO)}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    feedingDate === todayISO ? 'bg-primary text-white' : 'bg-surface text-text-secondary'
                  }`}
                >
                  {t('common.today')}
                </button>
                <button
                  type="button"
                  onClick={() => setFeedingDate(yesterdayISO)}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    feedingDate === yesterdayISO ? 'bg-primary text-white' : 'bg-surface text-text-secondary'
                  }`}
                >
                  {t('common.yesterday')}
                </button>
              </div>

              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-text-secondary shrink-0">{t('feeding.date')}</span>
                <input
                  type="date"
                  value={feedingDate}
                  max={todayISO}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="input-compact !py-1.5 !text-sm w-[160px]"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => void openDailyTankReport()}
              className="btn-secondary flex items-center justify-center gap-2 !py-2"
            >
              <FileText size={18} />
              {t('reports.viewDailyTank')}
            </button>
          </div>

          {existingEntry && existingEntry.meals.length > 0 ? (
            <div className="card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className="p-2 text-left">{t('feeding.mealCol')}</th>
                    <th className="p-2 text-right">{t('feeding.quantity')}</th>
                    <th className="p-2 text-right">{t('feeding.time')}</th>
                  </tr>
                </thead>
                <tbody>
                  {existingEntry.meals.map((meal) => (
                    <tr key={meal.id} className="border-t border-border">
                      <td className="p-2">{meal.mealNumber}</td>
                      <td className="p-2 text-right font-medium">{formatQty(meal.feedQuantityKg)}</td>
                      <td className="p-2 text-right text-text-secondary">{meal.actualTime || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-3 border-t border-border flex justify-between items-center bg-primary-light/50">
                <span className="text-sm font-medium">{t('feeding.todayTotal')}</span>
                <span className="font-bold text-lg">{formatQty(existingEntry.totalDailyFeedKg)}</span>
              </div>
            </div>
          ) : (
            <div className="card text-center py-8">
              <p className="text-text-secondary">{t('feeding.noMealsYet')}</p>
            </div>
          )}

          {existingEntry?.isLocked ? (
            <RecordLockNotice />
          ) : (
            <div className="sticky bottom-0 bg-background pt-2 pb-4 space-y-2">
              <button
                type="button"
                onClick={() => setScanOpen(true)}
                className="btn-secondary flex items-center justify-center gap-2"
              >
                <ScanLine size={20} />
                {t('feeding.scan.title')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(true);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="btn-primary flex items-center justify-center gap-2"
              >
                <Plus size={20} />
                {existingEntry ? t('feeding.addMeal') : t('feeding.addFeed')}
              </button>
              <button type="button" onClick={() => navigate('/')} className="btn-secondary">
                {t('feeding.backHome')}
              </button>
            </div>
          )}

          {selectedPond?.activeCycle && feedProducts && (
            <ScanSheetModal
              isOpen={scanOpen}
              onClose={() => setScanOpen(false)}
              feedingDate={feedingDate}
              selectedFarmId={selectedFarmId!}
              pondId={selectedPondId}
              cultureCycleId={selectedPond.activeCycle.id}
              feedProducts={feedProducts}
              existingEntry={existingEntry ?? null}
              onSaved={() => void refetchEntryForDate()}
            />
          )}

          {dailyReportOpen && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-end">
              <div className="w-full bg-background rounded-t-2xl p-4 pb-6 max-h-[92dvh] overflow-y-auto animate-slide-in-up">
                <div className="flex items-center justify-between mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t('reports.dailyTankTitle')}</p>
                    <p className="text-xs text-text-secondary truncate">
                      {selectedPond?.name} • {feedingDate}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDailyReportOpen(false)}
                    className="min-h-touch min-w-touch flex items-center justify-center"
                  >
                    <X />
                  </button>
                </div>

                {dailyReportLoading && (
                  <div className="card">
                    <p className="text-text-secondary">{t('common.loading')}</p>
                  </div>
                )}

                {dailyReportError && (
                  <div className="card border-danger text-danger text-sm">
                    {dailyReportError}
                  </div>
                )}

                {dailyReport && (
                  <>
                    <div className="card">
                      <p className="font-semibold">{dailyReport.summary.totalEntries} entries</p>
                      <p className="text-2xl font-bold">{dailyReport.summary.periodTotalKg} kg</p>
                    </div>

                    {dailyReport.rows?.[0] && (
                      <div className="card space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-text-secondary">DOC</span>
                          <span className="font-semibold">{String(dailyReport.rows[0].doc ?? '—')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-secondary">Feed</span>
                          <span className="font-semibold">{String(dailyReport.rows[0].feedCode ?? '—')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-secondary">Cumulative</span>
                          <span className="font-semibold">{String(dailyReport.rows[0].cumulative ?? '—')}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border text-xs">
                          <div className="flex justify-between"><span className="text-text-secondary">M1</span><span className="font-medium">{String(dailyReport.rows[0].meal1 ?? '')}</span></div>
                          <div className="flex justify-between"><span className="text-text-secondary">M2</span><span className="font-medium">{String(dailyReport.rows[0].meal2 ?? '')}</span></div>
                          <div className="flex justify-between"><span className="text-text-secondary">M3</span><span className="font-medium">{String(dailyReport.rows[0].meal3 ?? '')}</span></div>
                          <div className="flex justify-between"><span className="text-text-secondary">M4</span><span className="font-medium">{String(dailyReport.rows[0].meal4 ?? '')}</span></div>
                          <div className="flex justify-between"><span className="text-text-secondary">M5</span><span className="font-medium">{String(dailyReport.rows[0].meal5 ?? '')}</span></div>
                          <div className="flex justify-between"><span className="text-text-secondary">TDF</span><span className="font-semibold">{String(dailyReport.rows[0].tdf ?? '')}</span></div>
                        </div>
                      </div>
                    )}

                    {isOwner && dailyReport.id !== 'local' ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => downloadDailyReport('pdf')} className="btn-secondary !text-sm">
                          {t('reports.downloadPdf')}
                        </button>
                        <button onClick={() => downloadDailyReport('excel')} className="btn-secondary !text-sm">
                          {t('reports.downloadExcel')}
                        </button>
                        <button onClick={() => void shareDailyReport()} className="btn-secondary !text-sm">
                          {t('reports.share')}
                        </button>
                        <button onClick={() => window.print()} className="btn-secondary !text-sm">
                          {t('reports.print')}
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => void shareDailyReport()} className="btn-secondary !text-sm">
                          {t('reports.share')}
                        </button>
                        <button onClick={() => window.print()} className="btn-secondary !text-sm">
                          {t('reports.print')}
                        </button>
                      </div>
                    )}

                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => navigate(`/reports?pondId=${selectedPondId}&date=${feedingDate}`)}
                        className="btn-primary"
                      >
                        {t('reports.openFull')}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={selectedPond?.name || t('feeding.selectTank')} showNav={false}>
      <div className="px-4 py-4 space-y-4 overflow-x-hidden">
        <button
          type="button"
          onClick={goToTankOverview}
          className="flex items-center gap-1 text-sm text-primary font-medium"
        >
          <ArrowLeft size={18} />
          {t('feeding.viewFeeds')}
        </button>

        <div className="rounded-xl border border-border bg-primary-light px-3 py-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0 text-text-secondary">
              <span className="font-medium text-text-primary">DOC {displayDoc ?? '—'}</span>
              {displayFeedCode && (
                <>
                  <span className="mx-2">•</span>
                  <span>
                    {t('feeding.feedCode')}: <span className="font-medium text-text-primary">{displayFeedCode}</span>
                  </span>
                </>
              )}
            </div>
            {existingEntry && (
              <div className="text-right shrink-0">
                <div className="text-[11px] text-text-secondary leading-none">{dayTotalLabel}</div>
                <div className="font-bold text-base text-text-primary leading-tight">
                  {formatQty(existingEntry.totalDailyFeedKg)}
                </div>
              </div>
            )}
          </div>
        </div>

        {existingEntry?.isLocked ? (
          <RecordLockNotice />
        ) : (
        <>
        {feedProducts && feedProducts.length > 0 && !existingEntry && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="label mb-0 shrink-0">{t('feeding.feedCode')}</span>
            {feedProducts.map((fp) => (
              <button
                key={fp.id}
                type="button"
                onClick={() => setFeedProductId(fp.id)}
                className={`min-h-touch px-4 rounded-lg font-bold text-base border-2 ${
                  feedProductId === fp.id
                    ? 'bg-primary text-white border-primary'
                    : 'bg-surface text-primary border-border'
                }`}
              >
                {fp.feedCode}
              </button>
            ))}
          </div>
        )}

        <div className={`card w-full min-w-0 overflow-hidden p-4 space-y-3 ${justOpenedForm ? 'animate-slide-in-up' : ''}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">
              {t('feeding.meal', { number: nextMealNumber })}
            </p>
            <div className="flex gap-1">
              {(['kg', 'ton'] as QuantityUnit[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setQuantityUnit(u)}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    quantityUnit === u ? 'bg-primary text-white' : 'bg-surface text-text-secondary'
                  }`}
                >
                  {u === 'kg' ? t('common.kg') : t('common.ton')}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {dateLocked ? (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text-secondary">{t('feeding.date')}</span>
                <span className="font-semibold">{formatShortDate(feedingDate)}</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setFeedingDate(todayISO)}
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      feedingDate === todayISO ? 'bg-primary text-white' : 'bg-surface text-text-secondary'
                    }`}
                  >
                    {t('common.today')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedingDate(yesterdayISO)}
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      feedingDate === yesterdayISO ? 'bg-primary text-white' : 'bg-surface text-text-secondary'
                    }`}
                  >
                    {t('common.yesterday')}
                  </button>
                </div>
                {isOwner ? (
                  <input
                    id="meal-date"
                    type="date"
                    value={feedingDate}
                    max={todayISO}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="input-compact"
                  />
                ) : (
                  <p className="input-compact text-center font-medium">{formatShortDate(feedingDate)}</p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 w-full min-w-0">
              <span className="text-sm text-text-secondary shrink-0">{t('feeding.time')}</span>
              <select
                value={mealHour}
                onChange={(e) => handleMealHourChange(e.target.value)}
                className="input-compact flex-1 min-w-0"
                aria-label={t('feeding.time')}
              >
                {Array.from({ length: 24 }, (_, i) => {
                  const h = String(i).padStart(2, '0');
                  const label = new Date(2000, 0, 1, i).toLocaleTimeString('en-IN', {
                    hour: 'numeric',
                    hour12: true,
                  });
                  return (
                    <option key={h} value={h}>
                      {label}
                    </option>
                  );
                })}
              </select>
              <span className="text-lg font-semibold text-text-secondary shrink-0">:</span>
              <select
                value={mealMinute}
                onChange={(e) => handleMealMinuteChange(e.target.value)}
                className="input-compact w-20 shrink-0"
                aria-label={t('feeding.time')}
              >
                {Array.from({ length: 60 }, (_, i) => {
                  const m = String(i).padStart(2, '0');
                  return (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="label mb-0">{t('feeding.quantity')}</span>
            {suggestedQty && quantity === '' && (
              <button
                type="button"
                onClick={() => setQuantity(suggestedQty)}
                className="text-sm font-medium text-primary"
              >
                {t('feeding.useLastQty', { qty: formatQty(suggestedQty) })}
              </button>
            )}
          </div>
          <NumericQuantityInput
            value={quantity}
            onChange={setQuantity}
            unit={quantityUnit}
          />
        </div>

        {confirmLarge && (
          <div className="card border-warning">
            <p className="text-sm mb-3">
              {t('feeding.confirmLarge', {
                usual: usualQty,
                entered: quantity,
              })}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmLarge(false)} className="btn-secondary flex-1">
                {t('common.cancel')}
              </button>
              <button
                onClick={() => { setConfirmLarge(false); void handleSave(true); }}
                className="btn-primary flex-1"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        )}

        <div className="sticky bottom-0 bg-background pt-2 pb-4 space-y-2">
          {saveError && (
            <div className="rounded-xl border border-danger bg-surface p-3 text-danger text-sm">
              {saveError}
            </div>
          )}
          <div className="flex items-stretch gap-2">
            <div className="flex-1 rounded-xl border border-border bg-surface p-3 flex items-center justify-between">
              <span className="text-sm text-text-secondary">{dayTotalLabel}</span>
              <span className="font-bold text-lg">{formatQty(currentTdf)}</span>
            </div>
            <button
              onClick={() => void handleSave()}
              disabled={!quantity || parseFloat(quantity) <= 0 || saving}
              className="btn-primary w-auto px-5 text-base shrink-0"
            >
              {saving ? t('common.loading') : existingEntry ? t('feeding.saveMeal') : t('feeding.save')}
            </button>
          </div>
        </div>
        </>
        )}
      </div>
    </AppShell>
  );
}

