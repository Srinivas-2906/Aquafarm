import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Trash2 } from 'lucide-react';
import { EditTankNameButton } from '@/components/EditTankNameButton';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/roles';
import { api, ApiError } from '@/lib/api';
import {
  compareTankCode,
  formatQty,
  formatTankCode,
  from24HourTime,
  getTodayISO,
  groupMealsByFeedSlot,
} from '@/lib/utils';
import type { FeedingEntryDto, PondTodayStatusDto } from '@aqualedger/contracts';

export type TankRowData = {
  pondId: string;
  pondName: string;
  pondCode: string;
  hasEntryToday?: boolean;
  todayTotalFeedKg?: string;
  mealsEntered?: number;
  doc?: number | null;
};

type TankRowListProps = {
  tanks: TankRowData[];
  showTodaySummary?: boolean;
  onSelect?: (pondId: string) => void;
  feedingLinkPrefix?: string;
};

function sortTanks(tanks: TankRowData[]): TankRowData[] {
  return [...tanks].sort((a, b) => compareTankCode(a.pondCode, b.pondCode));
}

async function fetchTodayEntry(
  farmId: string,
  pondId: string,
  date: string,
): Promise<FeedingEntryDto | null> {
  const result = await api.get<{ data: FeedingEntryDto[] }>(
    `/feeding-entries?farmId=${farmId}&pondId=${pondId}&dateFrom=${date}&dateTo=${date}`,
  );
  return result.data[0] || null;
}

function TankQuickFeedPanel({
  pondId,
  onOpen,
}: {
  pondId: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const { selectedFarmId } = useAuth();
  const today = getTodayISO();

  const { data: entry, isLoading } = useQuery({
    queryKey: ['feeding-entry-by-date', pondId, today, 'quick-view'],
    queryFn: () => fetchTodayEntry(selectedFarmId!, pondId, today),
    enabled: !!selectedFarmId,
  });

  if (isLoading) {
    return <p className="text-xs text-text-secondary py-1">{t('common.loading')}</p>;
  }

  if (!entry?.meals.length) {
    return <p className="text-xs text-text-secondary py-1">{t('feeding.noMealsYet')}</p>;
  }

  const slots = groupMealsByFeedSlot(entry.meals);

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-text-secondary">
        {t('home.todayFeed', { qty: formatQty(entry.totalDailyFeedKg) })}
        {entry.doc ? ` · DOC ${entry.doc}` : ''}
      </p>
      <div className="space-y-1">
        {slots.map((slotMeals, slotIndex) =>
          slotMeals.map((meal) => {
            const time = meal.actualTime
              ? (() => {
                  const { hour, minute, ampm } = from24HourTime(meal.actualTime!);
                  return `${hour}:${minute} ${ampm}`;
                })()
              : '—';
            return (
              <div
                key={meal.id}
                className="grid grid-cols-[52px_44px_1fr_auto] gap-1.5 items-center text-xs"
              >
                <span className="text-text-secondary">{t('feeding.feedLabel', { number: slotIndex + 1 })}</span>
                <span className="font-semibold text-primary">{meal.feedCode || entry.feedCode}</span>
                <span className="font-semibold">{formatQty(meal.feedQuantityKg)}</span>
                <span className="text-text-secondary">{time}</span>
              </div>
            );
          }),
        )}
      </div>
      <button type="button" onClick={onOpen} className="btn-primary btn-inline w-full !py-1.5 !text-xs">
        {t('tanks.openFeeding')}
      </button>
    </div>
  );
}

function TankRowItem({
  tank,
  showTodaySummary,
  onSelect,
  feedingLinkPrefix,
  allowDelete,
  onDeleted,
}: {
  tank: TankRowData;
  showTodaySummary: boolean;
  onSelect?: (pondId: string) => void;
  feedingLinkPrefix: string;
  allowDelete: boolean;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedFarmId } = useAuth();
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  const openFeeding = () => {
    if (onSelect) {
      onSelect(tank.pondId);
      return;
    }
    navigate(`${feedingLinkPrefix}${tank.pondId}`);
  };

  const summaryText = showTodaySummary
    ? tank.hasEntryToday
      ? t('home.todayFeed', { qty: formatQty(tank.todayTotalFeedKg || '0') })
      : t('home.noFeedToday')
    : t('tanks.readyToStock');

  const handleDelete = async () => {
    if (!selectedFarmId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/farms/${selectedFarmId}/ponds/${tank.pondId}`);
      await queryClient.invalidateQueries({ queryKey: ['ponds', selectedFarmId] });
      await queryClient.invalidateQueries({ queryKey: ['pond-status', selectedFarmId] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', selectedFarmId] });
      setConfirmDelete(false);
      onDeleted?.();
    } catch (e) {
      setDeleteError(e instanceof ApiError ? e.message : t('common.error'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`relative rounded-lg border min-h-[52px] ${
        tank.hasEntryToday ? 'border-primary/25 bg-surface' : 'border-border bg-surface'
      }`}
    >
      <div className="flex items-center gap-1.5 px-2 py-2 min-h-[52px]">
        <button
          type="button"
          onClick={openFeeding}
          className="flex-1 min-w-0 flex items-center gap-2 text-left"
        >
          <span className="rounded-md bg-primary text-white text-[11px] font-bold px-1.5 py-0.5 shrink-0">
            {formatTankCode(tank.pondCode)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-primary truncate">{tank.pondName}</p>
            {showTodaySummary && (
              <p className="text-[11px] text-text-secondary truncate">{summaryText}</p>
            )}
          </div>
        </button>

        {showTodaySummary && (
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="min-h-0 min-w-0 w-8 h-8 flex items-center justify-center rounded-md border border-border text-text-secondary hover:text-primary hover:border-primary/40 shrink-0"
            aria-expanded={menuOpen}
            aria-label={t('tanks.quickFeeds')}
          >
            <ChevronDown size={16} className={menuOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
        )}

        <EditTankNameButton pondId={tank.pondId} name={tank.pondName} code={tank.pondCode} />

        {allowDelete && (
          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setConfirmDelete(true);
            }}
            className="min-h-0 min-w-0 w-8 h-8 flex items-center justify-center rounded-md border border-danger/30 bg-danger/5 text-danger hover:bg-danger/10 shrink-0"
            aria-label={t('tanks.deleteTank')}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {menuOpen && showTodaySummary && (
        <div className="border-t border-border px-2 py-2 bg-background/60">
          <TankQuickFeedPanel pondId={tank.pondId} onOpen={openFeeding} />
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-md space-y-3">
            <h3 className="font-bold text-lg">{t('tanks.deleteTank')}</h3>
            <p className="text-sm text-text-secondary">
              {t('tanks.deleteTankConfirm', { name: tank.pondName, code: tank.pondCode })}
            </p>
            {deleteError && <p className="text-danger text-sm">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="btn-secondary flex-1"
                disabled={deleting}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="btn-primary flex-1 !bg-danger !border-danger"
              >
                {deleting ? t('common.loading') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function TankRowList({
  tanks,
  showTodaySummary = true,
  onSelect,
  feedingLinkPrefix = '/feeding/entry?pondId=',
}: TankRowListProps) {
  const { user } = useAuth();
  const sorted = useMemo(() => sortTanks(tanks), [tanks]);
  const allowDelete = user?.role === UserRole.OWNER;

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((tank) => (
        <TankRowItem
          key={tank.pondId}
          tank={tank}
          showTodaySummary={showTodaySummary}
          onSelect={onSelect}
          feedingLinkPrefix={feedingLinkPrefix}
          allowDelete={allowDelete}
        />
      ))}
    </div>
  );
}

export function pondStatusesToTankRows(statuses: PondTodayStatusDto[]): TankRowData[] {
  return statuses.map((pond) => ({
    pondId: pond.pondId,
    pondName: pond.pondName,
    pondCode: pond.pondCode,
    hasEntryToday: pond.hasEntryToday,
    todayTotalFeedKg: pond.todayTotalFeedKg,
    mealsEntered: pond.mealsEntered,
    doc: pond.doc,
  }));
}

export function pondsToTankRows(
  ponds: Array<{ id: string; name: string; code: string }>,
  statusById?: Map<string, PondTodayStatusDto>,
): TankRowData[] {
  return ponds.map((pond) => {
    const status = statusById?.get(pond.id);
    return {
      pondId: pond.id,
      pondName: pond.name,
      pondCode: pond.code,
      hasEntryToday: status?.hasEntryToday,
      todayTotalFeedKg: status?.todayTotalFeedKg,
      mealsEntered: status?.mealsEntered,
      doc: status?.doc,
    };
  });
}
