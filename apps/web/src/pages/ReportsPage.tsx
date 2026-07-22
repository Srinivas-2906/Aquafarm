import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, Download, Share2, Printer, Filter } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { FeedCodeMultiSelect } from '@/components/FeedCodeMultiSelect';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import type { FeedProductDto, FeedingEntryDto, PondDto } from '@aqualedger/contracts';
import {
  addDaysISO,
  formatDate,
  formatQty,
  from24HourTime,
  getTodayISO,
  getYesterdayISO,
  groupMealsByFeedSlot,
  sumKg,
} from '@/lib/utils';

type FeedingReportRow = {
  date: string;
  doc: number | string;
  feedCode: string;
  meal1: string;
  meal2: string;
  meal3: string;
  meal4: string;
  meal5: string;
  tdf: string;
  cumulative: string;
  checkTray: string;
  remarks: string;
  pondName: string;
};

type FeedingReport = {
  id: string;
  rows: FeedingReportRow[];
  summary: { totalEntries: number; periodTotalKg: string };
  downloadUrls: { pdf: string; excel: string };
};

type FeedLoadParams = {
  dateFrom: string;
  dateTo: string;
  pondId: string;
  feedProductIds: string[];
};

type FeedLine = {
  key: string;
  label: string;
  feedCode: string;
  quantity: string;
  time: string;
};

type DateFeedGroup = {
  date: string;
  doc: number;
  totalKg: string;
  feeds: FeedLine[];
};

function entryDateISO(entry: FeedingEntryDto): string {
  return entry.feedingDate.split('T')[0];
}

function formatMealTime(time24: string | null | undefined): string {
  if (!time24) return '—';
  const { hour, minute, ampm } = from24HourTime(time24);
  return `${hour}:${minute} ${ampm}`;
}

function entriesToDateGroups(entries: FeedingEntryDto[], feedProductIds: string[]): DateFeedGroup[] {
  return [...entries]
    .sort((a, b) => entryDateISO(b).localeCompare(entryDateISO(a)))
    .map((entry) => {
      const meals = [...entry.meals]
        .sort((a, b) => a.mealNumber - b.mealNumber)
        .filter((meal) => {
          if (!feedProductIds.length) return true;
          const mealProductId = meal.feedProductId || entry.feedProductId;
          return feedProductIds.includes(mealProductId);
        });
      const totalKg = meals.reduce((sum, meal) => sum + (parseFloat(meal.feedQuantityKg) || 0), 0);
      const feedSlots = groupMealsByFeedSlot(meals);
      return {
        date: entryDateISO(entry),
        doc: entry.doc,
        totalKg: totalKg.toFixed(3),
        feeds: feedSlots.flatMap((slotMeals, slotIndex) =>
          slotMeals.map((meal) => ({
            key: meal.id,
            label: `Feed ${slotIndex + 1}`,
            feedCode: meal.feedCode || entry.feedCode || '—',
            quantity: formatQty(meal.feedQuantityKg),
            time: formatMealTime(meal.actualTime),
          })),
        ),
      };
    })
    .filter((group) => group.feeds.length > 0);
}

function dateHeading(dateISO: string, t: (key: string) => string): string {
  const formatted = formatDate(dateISO);
  const today = getTodayISO();
  const yesterday = getYesterdayISO();
  if (dateISO === today) return `${t('records.today')} · ${formatted}`;
  if (dateISO === yesterday) return `${t('records.yesterday')} · ${formatted}`;
  return formatted;
}

async function fetchFeedEntries(
  farmId: string,
  params: FeedLoadParams,
): Promise<FeedingEntryDto[]> {
  const query = new URLSearchParams({
    farmId,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    pageSize: '100',
  });
  if (params.pondId) query.set('pondId', params.pondId);
  const result = await api.get<{ data: FeedingEntryDto[] }>(`/feeding-entries?${query}`);
  if (!params.feedProductIds.length) return result.data;
  return result.data.filter((entry) => {
    if (params.feedProductIds.includes(entry.feedProductId)) return true;
    return entry.meals.some((meal) => {
      const mealProductId = meal.feedProductId || entry.feedProductId;
      return params.feedProductIds.includes(mealProductId);
    });
  });
}

export function ReportsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedFarmId } = useAuth();
  const [searchParams] = useSearchParams();

  const initialPondId = searchParams.get('pondId') || '';
  const initialFeedProductIds = searchParams.get('feedProductId')
    ? [searchParams.get('feedProductId')!]
    : [];
  const fromFeeding = searchParams.get('from') === 'feeding';
  const tankReportMode = fromFeeding && !!initialPondId;

  const todayISO = getTodayISO();
  const yesterdayISO = getYesterdayISO();
  const last7From = addDaysISO(todayISO, -6);

  const [dateFrom, setDateFrom] = useState(todayISO);
  const [dateTo, setDateTo] = useState(todayISO);
  const [pondId, setPondId] = useState(initialPondId);
  const [feedProductIds, setFeedProductIds] = useState<string[]>(initialFeedProductIds);
  const [showFilters, setShowFilters] = useState(() => !!initialPondId);
  const [loadParams, setLoadParams] = useState<FeedLoadParams | null>(null);
  const [report, setReport] = useState<FeedingReport | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState<'pdf' | 'excel' | null>(null);

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

  const pondLabel = useMemo(() => ponds?.find((p) => p.id === pondId)?.name || '', [ponds, pondId]);
  const sortedFeedProducts = useMemo(
    () =>
      feedProducts
        ? [...feedProducts].sort(
            (a, b) =>
              ['1C', '2C', '20', '3S', '3SP', '3P'].indexOf(a.feedCode) -
              ['1C', '2C', '20', '3S', '3SP', '3P'].indexOf(b.feedCode),
          )
        : [],
    [feedProducts],
  );

  const feedLabel = useMemo(
    () =>
      feedProductIds
        .map((id) => sortedFeedProducts.find((p) => p.id === id)?.feedCode)
        .filter(Boolean)
        .join(', '),
    [feedProductIds, sortedFeedProducts],
  );

  const isDateRangeValid = dateFrom <= dateTo;
  const singleTankReport = !!pondId;

  const {
    data: loadedEntries,
    isLoading: entriesLoading,
    isError: entriesError,
    error: entriesFetchError,
  } = useQuery({
    queryKey: ['feeding-report-entries', selectedFarmId, loadParams],
    queryFn: () => fetchFeedEntries(selectedFarmId!, loadParams!),
    enabled: !!selectedFarmId && !!loadParams && tankReportMode,
  });

  const tankDateGroups = useMemo(
    () =>
      loadedEntries
        ? entriesToDateGroups(loadedEntries, loadParams?.feedProductIds ?? feedProductIds)
        : [],
    [loadedEntries, loadParams?.feedProductIds, feedProductIds],
  );

  const generate = useMutation({
    mutationFn: () =>
      api.post<FeedingReport>('/reports/generate', {
        farmId: selectedFarmId,
        pondId: pondId || undefined,
        feedProductId: feedProductIds.length === 1 ? feedProductIds[0] : undefined,
        feedProductIds: feedProductIds.length ? feedProductIds : undefined,
        dateFrom,
        dateTo,
        reportType: 'FEEDING_DATE_RANGE',
      }),
    onSuccess: (data) => {
      setReport(data);
      setShowAllRows(false);
    },
  });

  const handleLoad = () => {
    if (!selectedFarmId || !isDateRangeValid) return;
    if (tankReportMode) {
      setLoadParams({ dateFrom, dateTo, pondId, feedProductIds });
      return;
    }
    generate.mutate();
  };

  const isLoading = tankReportMode ? entriesLoading : generate.isPending;
  const loadError = tankReportMode
    ? entriesError
      ? (entriesFetchError as Error)?.message || t('common.error')
      : null
    : generate.isError
      ? (generate.error as Error)?.message || t('common.error')
      : null;

  const hasTankResults = tankReportMode && loadParams && !entriesLoading && !entriesError;
  const tankTotalKg = sumKg(tankDateGroups.map((group) => group.totalKg));

  const download = async (format: 'pdf' | 'excel') => {
    let reportId = report?.id;
    if (!reportId) {
      try {
        const generated = await generate.mutateAsync();
        reportId = generated.id;
        setReport(generated);
      } catch {
        return;
      }
    }
    if (!reportId) return;
    try {
      setDownloadBusy(format);
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      const file = await api.file(`/reports/${reportId}/download?format=${format}`);
      const url = URL.createObjectURL(file.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename || `feeding-report-${reportId}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloadBusy(null);
    }
  };

  const share = async () => {
    if (!report) return;
    const text = `Feeding Report\nPeriod: ${formatDate(dateFrom)} to ${formatDate(dateTo)}\nTotal: ${report.summary.periodTotalKg} kg\nEntries: ${report.summary.totalEntries}`;
    if (navigator.share) {
      await navigator.share({ title: 'Feeding Report', text });
    } else {
      await navigator.clipboard.writeText(text);
      alert('Summary copied to clipboard');
    }
  };

  const presetClass = (active: boolean) =>
    `px-3 py-1 rounded-full text-sm font-medium ${
      active ? 'bg-primary text-white' : 'bg-surface text-text-secondary'
    }`;

  return (
    <AppShell
      title={fromFeeding && pondLabel ? `${pondLabel} — ${t('reports.title')}` : t('reports.title')}
      onBack={
        fromFeeding && initialPondId
          ? () => navigate(`/feeding/entry?pondId=${initialPondId}`)
          : undefined
      }
    >
      <div className="px-4 py-4 space-y-4">
        <div className="card space-y-3">
          <div className="space-y-2">
            <label className="label">{t('reports.period')}</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setDateFrom(todayISO);
                  setDateTo(todayISO);
                }}
                className={presetClass(dateFrom === todayISO && dateTo === todayISO)}
              >
                {t('common.today')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateFrom(yesterdayISO);
                  setDateTo(yesterdayISO);
                }}
                className={presetClass(dateFrom === yesterdayISO && dateTo === yesterdayISO)}
              >
                {t('common.yesterday')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateFrom(last7From);
                  setDateTo(todayISO);
                }}
                className={presetClass(dateFrom === last7From && dateTo === todayISO)}
              >
                {t('reports.last7')}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">{t('reports.from')}</label>
              <input
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input-compact !py-2 !text-base w-full"
              />
            </div>
            <div>
              <label className="label">{t('reports.to')}</label>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                max={todayISO}
                onChange={(e) => setDateTo(e.target.value)}
                className="input-compact !py-2 !text-base w-full"
              />
            </div>
          </div>

          {!isDateRangeValid && (
            <div className="card border-danger text-danger text-sm">
              {t('reports.invalidDateRange')}
            </div>
          )}

          {!tankReportMode && (
            <button
              type="button"
              onClick={() => setShowFilters((s) => !s)}
              className="w-full flex items-center justify-between text-sm font-medium text-primary"
            >
              <span className="flex items-center gap-2">
                <Filter size={16} />
                {t('reports.filtersOptional')}
              </span>
              <ChevronDown size={18} className={showFilters ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>
          )}

          {(pondLabel || feedLabel) && (
            <div className="flex flex-wrap gap-2">
              {pondLabel && (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-primary-light text-primary">
                  {t('reports.tank')}: {pondLabel}
                </span>
              )}
              {feedLabel && (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-primary-light text-primary">
                  {t('reports.feed')}: {feedLabel}
                </span>
              )}
            </div>
          )}

          {(showFilters || tankReportMode) && (
            <div className="space-y-3">
              {!tankReportMode && (
                <div>
                  <label className="label">{t('reports.tank')}</label>
                  <select value={pondId} onChange={(e) => setPondId(e.target.value)} className="input-field text-base">
                    <option value="">{t('reports.allTanks')}</option>
                    {ponds?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="label">{t('reports.feed')}</label>
                <FeedCodeMultiSelect
                  products={sortedFeedProducts}
                  selectedIds={feedProductIds}
                  onChange={setFeedProductIds}
                  allLabel={t('reports.allFeeds')}
                />
              </div>
            </div>
          )}

          {loadError && (
            <div className="card border-danger text-danger text-sm">{loadError}</div>
          )}

          <button
            type="button"
            onClick={handleLoad}
            disabled={isLoading || !selectedFarmId || !isDateRangeValid}
            className="btn-primary"
          >
            {isLoading ? t('common.loading') : t('reports.load')}
          </button>
        </div>

        {tankReportMode && !loadParams && !isLoading && (
          <p className="text-sm text-text-secondary text-center py-2">{t('reports.tapLoad')}</p>
        )}

        {tankReportMode && hasTankResults && (
          <>
            <div className="card">
              <p className="font-semibold">
                {t('reports.entriesCount', { count: tankDateGroups.length })}
              </p>
              <p className="text-2xl font-bold">{formatQty(tankTotalKg)}</p>
            </div>

            {tankDateGroups.length === 0 ? (
              <div className="card text-sm text-text-secondary">{t('reports.noData')}</div>
            ) : (
              <div className="space-y-3 max-h-[min(65vh,520px)] overflow-y-auto">
                {tankDateGroups.map((group) => (
                  <div key={group.date} className="card space-y-2 !p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-primary">{dateHeading(group.date, t)}</p>
                        <p className="text-xs text-text-secondary">DOC {group.doc}</p>
                      </div>
                      <p className="text-sm font-bold shrink-0">{formatQty(group.totalKg)}</p>
                    </div>

                    {group.feeds.length === 0 ? (
                      <p className="text-xs text-text-secondary">{t('feeding.noMealsYet')}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {group.feeds.map((feed) => (
                          <div
                            key={feed.key}
                            className="grid grid-cols-[56px_68px_1fr_auto] gap-2 items-center rounded-lg border border-border bg-surface px-2 py-1.5"
                          >
                            <span className="text-[11px] font-medium text-text-secondary">{feed.label}</span>
                            <span className="text-xs font-semibold text-primary">{feed.feedCode}</span>
                            <span className="text-sm font-semibold">{feed.quantity}</span>
                            <span className="text-xs font-medium text-text-secondary">{feed.time}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!tankReportMode && report && !generate.isPending && (
          <>
            <div className="card">
              <p className="font-semibold">{report.summary.totalEntries} entries</p>
              <p className="text-2xl font-bold">{report.summary.periodTotalKg} kg total</p>
              {(pondLabel || feedLabel) && (
                <p className="text-sm text-text-secondary mt-1">
                  {pondLabel ? `Tank: ${pondLabel}` : ''}
                  {pondLabel && feedLabel ? ' • ' : ''}
                  {feedLabel ? `Feed: ${feedLabel}` : ''}
                </p>
              )}
            </div>

            {report.rows.length === 0 ? (
              <div className="card text-sm text-text-secondary">{t('reports.noData')}</div>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-[min(60vh,480px)] card p-0">
                <table className="w-full text-sm">
                  <thead className="bg-primary-light sticky top-0 z-10">
                    <tr>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2">DOC</th>
                      <th className="p-2">Code</th>
                      <th className="p-2">M1</th>
                      <th className="p-2">M2</th>
                      <th className="p-2">M3</th>
                      <th className="p-2">M4</th>
                      <th className="p-2">M5</th>
                      {!singleTankReport && <th className="p-2">Tank</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllRows ? report.rows : report.rows.slice(0, 50)).map((row, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2 whitespace-nowrap">{formatDate(row.date)}</td>
                        <td className="p-2 text-center">{row.doc}</td>
                        <td className="p-2 text-center">{row.feedCode}</td>
                        <td className="p-2 text-center">{row.meal1}</td>
                        <td className="p-2 text-center">{row.meal2}</td>
                        <td className="p-2 text-center">{row.meal3}</td>
                        <td className="p-2 text-center">{row.meal4}</td>
                        <td className="p-2 text-center">{row.meal5}</td>
                        {!singleTankReport && <td className="p-2">{row.pondName}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {report.rows.length > 50 && (
              <button
                type="button"
                className="btn-secondary !text-sm"
                onClick={() => setShowAllRows((s) => !s)}
              >
                {showAllRows ? t('common.showLess', 'Show less') : t('common.showAll', 'Show all')} ({report.rows.length})
              </button>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => download('pdf')}
                disabled={downloadBusy === 'pdf'}
                className="btn-secondary flex items-center justify-center gap-2 !text-sm"
              >
                <Download size={18} /> {downloadBusy === 'pdf' ? t('common.loading') : t('reports.downloadPdf')}
              </button>
              <button
                onClick={() => download('excel')}
                disabled={downloadBusy === 'excel'}
                className="btn-secondary flex items-center justify-center gap-2 !text-sm"
              >
                <Download size={18} /> {downloadBusy === 'excel' ? t('common.loading') : t('reports.downloadExcel')}
              </button>
              <button onClick={share} className="btn-secondary flex items-center justify-center gap-2 !text-sm">
                <Share2 size={18} /> {t('reports.share')}
              </button>
              <button onClick={() => window.print()} className="btn-secondary flex items-center justify-center gap-2 !text-sm">
                <Printer size={18} /> {t('reports.print')}
              </button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
