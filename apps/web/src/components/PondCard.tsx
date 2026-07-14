import type { PondTodayStatusDto } from '@aqualedger/contracts';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { cn, formatQty } from '@/lib/utils';

interface PondCardProps {
  pond: PondTodayStatusDto;
}

export function PondCard({ pond }: PondCardProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'card flex flex-col min-h-[140px] border-2',
        pond.hasEntryToday ? 'border-primary/25 bg-surface' : 'border-accent bg-accent/5',
      )}
    >
      <div className="mb-2 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base font-bold text-primary leading-tight truncate">{pond.pondName}</h3>
          <span className="rounded-md bg-primary text-white text-[11px] font-bold px-2 py-0.5 shrink-0">
            #{pond.pondCode}
          </span>
        </div>
      </div>

      <div className="space-y-1 mb-3 flex-1">
        {pond.hasEntryToday ? (
          <p className="text-base font-semibold">
            {t('home.todayFeed', { qty: formatQty(pond.todayTotalFeedKg) })}
          </p>
        ) : (
          <p className="text-accent font-medium text-sm">{t('home.noFeedToday')}</p>
        )}
        <p className="text-sm text-text-secondary">
          {t('home.feedCount', { count: pond.mealsEntered })}
        </p>
        {pond.feedCode && (
          <p className="text-xs text-text-secondary">
            {t('feeding.feedCode')}: <span className="font-medium text-text-primary">{pond.feedCode}</span>
          </p>
        )}
      </div>

      <Link
        to={`/feeding/entry?pondId=${pond.pondId}`}
        className={cn(
          'flex items-center justify-center gap-1.5 min-h-touch rounded-lg font-semibold text-sm',
          pond.hasEntryToday
            ? 'bg-primary-light text-primary border border-primary'
            : 'bg-accent text-white',
        )}
      >
        <Plus size={18} />
        {pond.hasEntryToday ? t('feeding.viewFeeds') : t('feeding.addFeed')}
      </Link>
    </div>
  );
}
