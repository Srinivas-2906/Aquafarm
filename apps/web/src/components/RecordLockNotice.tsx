import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function RecordLockNotice() {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-3 p-4 bg-warning/10 border border-warning/30 rounded-lg">
      <Lock className="text-warning shrink-0 mt-0.5" size={20} />
      <p className="text-sm text-text-primary">{t('feeding.lockedMessage')}</p>
    </div>
  );
}
