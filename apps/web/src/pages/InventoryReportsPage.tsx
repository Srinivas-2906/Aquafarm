import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Download, Filter } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { FeedCodeMultiSelect } from '@/components/FeedCodeMultiSelect';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import type { FeedProductDto } from '@aqualedger/contracts';
import { formatQty, getTodayISO, getYesterdayISO } from '@/lib/utils';

type InventoryReportRow = {
  date: string;
  feedCode: string;
  addedKg: string;
  consumedKg: string;
};

type InventoryReport = {
  id: string;
  rows: InventoryReportRow[];
  summary: { feedCodes: number; totalAddedKg: string; totalConsumedKg: string };
  downloadUrls: { pdf: string; excel: string };
  farmName?: string;
};

const FEED_CODE_ORDER = ['1C', '2C', '20', '3S', '3SP', '3P'];

function formatCompactDate(dateISO: string): string {
  const [, month, day] = dateISO.split('-');
  return `${day}/${month}`;
}

function displayQty(value: string): string {
  return parseFloat(value) > 0 ? formatQty(value) : '—';
}

export function InventoryReportsPage() {
  const { t } = useTranslation();
  const { selectedFarmId } = useAuth();

  const todayISO = getTodayISO();
  const yesterdayISO = getYesterdayISO();
  const last7From = useMemo(() => {
    const d = new Date(todayISO);
    d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  }, [todayISO]);

  const [dateFrom, setDateFrom] = useState(todayISO);
  const [dateTo, setDateTo] = useState(todayISO);
  const [feedProductIds, setFeedProductIds] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [report, setReport] = useState<InventoryReport | null>(null);
  const [downloadBusy, setDownloadBusy] = useState<'pdf' | 'excel' | null>(null);

  const isDateRangeValid = dateFrom <= dateTo;

  const { data: feedProducts = [] } = useQuery({
    queryKey: ['feed-products', selectedFarmId],
    queryFn: () => api.get<FeedProductDto[]>(`/farms/${selectedFarmId}/feed-products`),
    enabled: !!selectedFarmId,
  });

  const sortedFeedProducts = useMemo(
    () =>
      [...feedProducts].sort(
        (a, b) => FEED_CODE_ORDER.indexOf(a.feedCode) - FEED_CODE_ORDER.indexOf(b.feedCode),
      ),
    [feedProducts],
  );

  const generate = useMutation({
    mutationFn: () =>
      api.post<InventoryReport>('/reports/inventory/generate', {
        farmId: selectedFarmId,
        dateFrom,
        dateTo,
        ...(feedProductIds.length ? { feedProductIds } : {}),
      }),
    onSuccess: (data) => setReport(data),
  });

  const feedLabel =
    feedProductIds.length === 1
      ? sortedFeedProducts.find((p) => p.id === feedProductIds[0])?.feedCode
      : feedProductIds.length > 1
        ? `${feedProductIds.length} codes`
        : '';

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
      const file = await api.file(`/reports/inventory/${reportId}/download?format=${format}`);
      const url = URL.createObjectURL(file.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename || `inventory-report-${reportId}.${ext}`;
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

  const presetClass = (active: boolean) =>
    `px-2 py-0.5 rounded-full text-xs font-medium ${
      active ? 'bg-primary text-white' : 'bg-surface text-text-secondary'
    }`;

  const loadError = generate.isError
    ? (generate.error as Error)?.message || t('common.error')
    : null;

  return (
    <AppShell title={t('inventoryReport.title')}>
      <div className="px-4 py-3 space-y-3">
        <div className="card !p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
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

          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
              className="input-compact !py-1.5 !text-sm w-full"
              aria-label={t('reports.from')}
            />
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={todayISO}
              onChange={(e) => setDateTo(e.target.value)}
              className="input-compact !py-1.5 !text-sm w-full"
              aria-label={t('reports.to')}
            />
          </div>

          {!isDateRangeValid && (
            <p className="text-danger text-xs">{t('reports.invalidDateRange')}</p>
          )}

          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className="flex items-center gap-1 text-xs font-medium text-primary"
          >
            <Filter size={14} />
            {t('reports.filtersOptional')}
            <ChevronDown size={14} className={showFilters ? 'rotate-180' : ''} />
          </button>

          {feedLabel && (
            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary-light text-primary">
              {feedLabel}
            </span>
          )}

          {showFilters && (
            <FeedCodeMultiSelect
              products={sortedFeedProducts}
              selectedIds={feedProductIds}
              onChange={setFeedProductIds}
              allLabel={t('reports.allFeeds')}
            />
          )}

          {loadError && <p className="text-danger text-xs">{loadError}</p>}

          <button
            type="button"
            onClick={() => generate.mutate()}
            disabled={generate.isPending || !selectedFarmId || !isDateRangeValid}
            className="btn-primary !py-2 !text-sm"
          >
            {generate.isPending ? t('common.loading') : t('inventoryReport.generate')}
          </button>
        </div>

        {report && !generate.isPending && (
          <>
            {report.rows.length === 0 ? (
              <div className="card !p-3 text-xs text-text-secondary">{t('inventoryReport.noData')}</div>
            ) : (
              <div className="card !p-0 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-primary-light/70 border-b border-border text-[11px]">
                  <span>
                    {t('inventoryReport.addedAbbr')}{' '}
                    <span className="font-bold text-text-primary">{formatQty(report.summary.totalAddedKg)}</span>
                  </span>
                  <span>
                    {t('inventoryReport.usedAbbr')}{' '}
                    <span className="font-bold text-text-primary">{formatQty(report.summary.totalConsumedKg)}</span>
                  </span>
                </div>

                <div className="max-h-[min(55vh,420px)] overflow-y-auto">
                  <div className="grid grid-cols-[2.75rem_2.25rem_1fr_1fr] gap-x-1.5 px-2 py-1 text-[10px] font-semibold text-text-secondary border-b border-border bg-surface sticky top-0">
                    <span>{t('inventory.dateLabel')}</span>
                    <span>{t('inventoryReport.code')}</span>
                    <span className="text-right">{t('inventoryReport.addedAbbr')}</span>
                    <span className="text-right">{t('inventoryReport.usedAbbr')}</span>
                  </div>
                  {report.rows.map((row, index) => {
                    const showDate = index === 0 || report.rows[index - 1].date !== row.date;
                    return (
                      <div
                        key={`${row.date}-${row.feedCode}`}
                        className="grid grid-cols-[2.75rem_2.25rem_1fr_1fr] gap-x-1.5 px-2 py-1 text-xs border-b border-border/50 items-center"
                      >
                        <span className="text-[10px] text-text-secondary tabular-nums">
                          {showDate ? formatCompactDate(row.date) : ''}
                        </span>
                        <span className="font-bold text-primary">{row.feedCode}</span>
                        <span className="text-right tabular-nums">{displayQty(row.addedKg)}</span>
                        <span className="text-right tabular-nums">{displayQty(row.consumedKg)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => download('pdf')}
                disabled={downloadBusy === 'pdf'}
                className="btn-secondary flex items-center justify-center gap-1.5 !py-2 !text-xs"
              >
                <Download size={16} /> {downloadBusy === 'pdf' ? t('common.loading') : 'PDF'}
              </button>
              <button
                onClick={() => download('excel')}
                disabled={downloadBusy === 'excel'}
                className="btn-secondary flex items-center justify-center gap-1.5 !py-2 !text-xs"
              >
                <Download size={16} /> {downloadBusy === 'excel' ? t('common.loading') : 'Excel'}
              </button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
