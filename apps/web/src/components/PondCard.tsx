import type { PondTodayStatusDto } from '@aqualedger/contracts';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus, CheckCircle } from 'lucide-react';
import { SyncStatusBadge } from './SyncStatusBadge';
import { cn, formatShortDate, formatQty } from '@/lib/utils';

interface PondCardProps {
  pond: PondTodayStatusDto;
}

export function PondCard({ pond }: PondCardProps) {
  const { t } = useTranslation();

  const mealLabel = pond.hasEntryToday
    ? pond.isComplete
      ? t('home.feedingComplete')
      : t('home.mealsProgress', { entered: pond.mealsEntered, total: pond.usualMealsPerDay })
    : t('home.noMeals');

  return (
    <div className={cn('card', !pond.hasEntryToday && 'border-accent border-2')}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="text-xl font-bold text-primary">{pond.pondName}</h3>
          {pond.doc && (
            <span className="text-sm text-text-secondary">{t('home.doc', { doc: pond.doc })}</span>
          )}
        </div>
        {pond.syncStatus && <SyncStatusBadge status={pond.syncStatus} />}
      </div>

      <div className="space-y-1 mb-3">
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-secondary">
          <span>{formatShortDate(new Date().toISOString())}</span>
          {pond.doc != null && <span>DOC {pond.doc}</span>}
          {pond.feedCode && <span>{pond.feedCode}</span>}
        </div>
        {pond.hasEntryToday ? (
          <p className="text-lg font-semibold">
            {t('home.todayFeed', { qty: formatQty(pond.todayTotalFeedKg) })}
          </p>
        ) : (
          <p className="text-accent font-medium">No feeding recorded today</p>
        )}
        <p className="text-sm text-text-secondary">{mealLabel}</p>
        {pond.lastMealTime && (
          <p className="text-xs text-text-secondary">
            {t('feeding.lastMeal', { time: pond.lastMealTime, qty: formatQty(pond.lastMealQuantityKg || '0') })}
          </p>
        )}
      </div>

      <Link
        to={`/feeding/entry?pondId=${pond.pondId}`}
        className={cn(
          'flex items-center justify-center gap-2 min-h-touch rounded-lg font-semibold text-base',
          pond.hasEntryToday
            ? 'bg-primary-light text-primary border border-primary'
            : 'bg-accent text-white',
        )}
      >
        {pond.hasEntryToday ? (
          <>
            <Plus size={20} />
            {t('feeding.viewFeeds')}
          </>
        ) : (
          <>
            <Plus size={20} />
            {t('feeding.addFeed')}
          </>
        )}
      </Link>

      {pond.isComplete && (
        <div className="flex items-center gap-1 mt-2 text-success text-sm">
          <CheckCircle size={16} />
          {t('home.feedingComplete')}
        </div>
      )}
    </div>
  );
}
