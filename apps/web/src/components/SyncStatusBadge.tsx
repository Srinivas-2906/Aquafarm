import { useTranslation } from 'react-i18next';
import { Cloud, CloudOff, Check, AlertCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusConfig = {
  SYNCED: { icon: Check, color: 'text-success', bg: 'bg-success/10' },
  PENDING: { icon: Clock, color: 'text-warning', bg: 'bg-warning/10' },
  PENDING_SYNC: { icon: CloudOff, color: 'text-offline', bg: 'bg-offline/10' },
  LOCAL_ONLY: { icon: CloudOff, color: 'text-offline', bg: 'bg-offline/10' },
  FAILED: { icon: AlertCircle, color: 'text-danger', bg: 'bg-danger/10' },
  SYNCING: { icon: Cloud, color: 'text-primary', bg: 'bg-primary/10' },
};

interface SyncStatusBadgeProps {
  status: string;
  className?: string;
}

export function SyncStatusBadge({ status, className }: SyncStatusBadgeProps) {
  const { t } = useTranslation();
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.PENDING;
  const Icon = config.icon;

  const labels: Record<string, string> = {
    SYNCED: t('sync.sent'),
    PENDING: t('sync.waiting'),
    PENDING_SYNC: t('sync.waiting'),
    LOCAL_ONLY: t('sync.savedOnPhone'),
    FAILED: t('sync.failed'),
    SYNCING: t('sync.sending'),
  };

  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium', config.bg, config.color, className)}>
      <Icon size={14} />
      {labels[status] || status}
    </span>
  );
}
