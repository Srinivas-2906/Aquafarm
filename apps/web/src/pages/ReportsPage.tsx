import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, Download, Share2, Printer, Filter } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import type { FeedProductDto, PondDto } from '@aqualedger/contracts';
import { addDaysISO, getTodayISO, getYesterdayISO } from '@/lib/utils';

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

export function ReportsPage() {
  const { t } = useTranslation();
  const { selectedFarmId } = useAuth();
  const [searchParams] = useSearchParams();

  const initialSingleDate = searchParams.get('date');
  const initialFrom = searchParams.get('dateFrom') || initialSingleDate;
  const initialTo = searchParams.get('dateTo') || initialSingleDate;
  const initialPondId = searchParams.get('pondId') || '';
  const initialFeedProductId = searchParams.get('feedProductId') || '';

  const todayISO = getTodayISO();
  const yesterdayISO = getYesterdayISO();
  const last7From = addDaysISO(todayISO, -6);
  const last14From = addDaysISO(todayISO, -13);

  const [dateFrom, setDateFrom] = useState(() => {
    if (initialFrom) return initialFrom;
    return last14From;
  });
  const [dateTo, setDateTo] = useState(() => initialTo || todayISO);
  const [pondId, setPondId] = useState(() => initialPondId);
  const [feedProductId, setFeedProductId] = useState(() => initialFeedProductId);
  const [showFilters, setShowFilters] = useState(() => !!initialPondId || !!initialFeedProductId);
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
  const feedLabel = useMemo(() => feedProducts?.find((p) => p.id === feedProductId)?.feedCode || '', [feedProducts, feedProductId]);

  const isDateRangeValid = dateFrom <= dateTo;

  const generate = useMutation({
    mutationFn: () =>
      api.post<FeedingReport>('/reports/generate', {
        farmId: selectedFarmId,
        pondId: pondId || undefined,
        feedProductId: feedProductId || undefined,
        dateFrom,
        dateTo,
        reportType: 'FEEDING_DATE_RANGE',
      }),
    onSuccess: (data) => {
      setReport(data);
      setShowAllRows(false);
    },
  });

  const download = async (format: 'pdf' | 'excel') => {
    if (!report) return;
    try {
      setDownloadBusy(format);
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      const file = await api.file(`/reports/${report.id}/download?format=${format}`);
      const url = URL.createObjectURL(file.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename || `feeding-report-${report.id}.${ext}`;
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
    const text = `Feeding Report\nPeriod: ${dateFrom} to ${dateTo}\nTotal: ${report.summary.periodTotalKg} kg\nEntries: ${report.summary.totalEntries}`;
    if (navigator.share) {
      await navigator.share({ title: 'Feeding Report', text });
    } else {
      await navigator.clipboard.writeText(text);
      alert('Summary copied to clipboard');
    }
  };

  return (
    <AppShell title={t('reports.title')}>
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
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  dateFrom === todayISO && dateTo === todayISO ? 'bg-primary text-white' : 'bg-surface text-text-secondary'
                }`}
              >
                {t('common.today')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateFrom(yesterdayISO);
                  setDateTo(yesterdayISO);
                }}
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  dateFrom === yesterdayISO && dateTo === yesterdayISO ? 'bg-primary text-white' : 'bg-surface text-text-secondary'
                }`}
              >
                {t('common.yesterday')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateFrom(last7From);
                  setDateTo(todayISO);
                }}
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  dateFrom === last7From && dateTo === todayISO ? 'bg-primary text-white' : 'bg-surface text-text-secondary'
                }`}
              >
                {t('reports.last7')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateFrom(last14From);
                  setDateTo(todayISO);
                }}
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  dateFrom === last14From && dateTo === todayISO ? 'bg-primary text-white' : 'bg-surface text-text-secondary'
                }`}
              >
                {t('reports.last14')}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">{t('reports.from')}</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input-compact !py-2 !text-base w-full"
              />
            </div>
            <div>
              <label className="label">{t('reports.to')}</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input-compact !py-2 !text-base w-full"
              />
            </div>
          </div>

          {!isDateRangeValid && (
            <div className="card border-danger text-danger text-sm">
              {t('reports.invalidDateRange', 'From date must be before or equal to To date.')}
            </div>
          )}

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

          {showFilters && (
            <div className="space-y-3">
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

              <div>
                <label className="label">{t('reports.feed')}</label>
                <select value={feedProductId} onChange={(e) => setFeedProductId(e.target.value)} className="input-field text-base">
                  <option value="">{t('reports.allFeeds')}</option>
                  {feedProducts?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.feedCode} — {p.brandName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {generate.isError && (
            <div className="card border-danger text-danger text-sm">
              {(generate.error as Error)?.message || 'Failed to generate report'}
            </div>
          )}

          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending || !selectedFarmId || !isDateRangeValid}
            className="btn-primary"
          >
            {generate.isPending ? t('common.loading') : t('reports.generate')}
          </button>
        </div>

        {report && (
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
              <div className="card text-sm text-text-secondary">
                {t('reports.noData', 'No entries found for the selected period/filters.')}
              </div>
            ) : (
              <div className="overflow-x-auto card p-0">
                <table className="w-full text-sm">
                  <thead className="bg-primary-light">
                    <tr>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2">DOC</th>
                      <th className="p-2">Code</th>
                      <th className="p-2">M1</th>
                      <th className="p-2">M2</th>
                      <th className="p-2">M3</th>
                      <th className="p-2">M4</th>
                      <th className="p-2">M5</th>
                      <th className="p-2">TDF</th>
                      <th className="p-2">Cum.</th>
                      <th className="p-2">Tray</th>
                      <th className="p-2 text-left">Remarks</th>
                      <th className="p-2">Tank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllRows ? report.rows : report.rows.slice(0, 50)).map((row, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2">{row.date}</td>
                        <td className="p-2 text-center">{row.doc}</td>
                        <td className="p-2 text-center">{row.feedCode}</td>
                        <td className="p-2 text-center">{row.meal1}</td>
                        <td className="p-2 text-center">{row.meal2}</td>
                        <td className="p-2 text-center">{row.meal3}</td>
                        <td className="p-2 text-center">{row.meal4}</td>
                        <td className="p-2 text-center">{row.meal5}</td>
                        <td className="p-2 text-center font-medium">{row.tdf}</td>
                        <td className="p-2 text-center">{row.cumulative}</td>
                        <td className="p-2 text-center">{row.checkTray}</td>
                        <td className="p-2">{row.remarks}</td>
                        <td className="p-2">{row.pondName}</td>
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
