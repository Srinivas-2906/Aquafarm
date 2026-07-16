import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pencil, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { PondDto } from '@aqualedger/contracts';

type EditTankNameButtonProps = {
  pondId: string;
  name: string;
  code?: string;
  className?: string;
  compact?: boolean;
  onUpdated?: (pond: PondDto) => void;
};

export function EditTankNameButton({
  pondId,
  name,
  code,
  className,
  compact = true,
  onUpdated,
}: EditTankNameButtonProps) {
  const { t } = useTranslation();
  const { selectedFarmId } = useAuth();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [tankName, setTankName] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTankName(name);
      setError(null);
    }
  }, [open, name]);

  const closeModal = () => setOpen(false);

  const saveTank = async () => {
    if (!selectedFarmId || !tankName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.patch<PondDto>(
        `/farms/${selectedFarmId}/ponds/${pondId}`,
        { name: tankName.trim() },
      );
      await queryClient.invalidateQueries({ queryKey: ['ponds', selectedFarmId] });
      await queryClient.invalidateQueries({ queryKey: ['pond-status', selectedFarmId] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', selectedFarmId] });
      setOpen(false);
      onUpdated?.(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          compact
            ? 'min-h-0 min-w-0 w-7 h-7 flex items-center justify-center rounded-md border border-border text-text-secondary hover:text-primary hover:border-primary/40 shrink-0'
            : 'btn-secondary btn-inline flex items-center gap-1.5 !py-2 !px-3 !text-sm !min-h-0',
          className,
        )}
        aria-label={t('tanks.editTank')}
      >
        <Pencil size={compact ? 14 : 16} />
        {!compact && t('tanks.editTank')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">{t('tanks.editTank')}</h3>
              <button type="button" onClick={closeModal} className="text-text-secondary">
                <X size={22} />
              </button>
            </div>

            {code && (
              <p className="text-sm text-text-secondary">
                {t('tanks.tankCode')}: <span className="font-semibold text-text-primary">#{code}</span>
              </p>
            )}

            <div>
              <label className="label">{t('tanks.tankName')}</label>
              <input
                value={tankName}
                onChange={(e) => setTankName(e.target.value)}
                className="input-field text-base"
                autoFocus
              />
            </div>

            {error && <p className="text-danger text-sm">{error}</p>}

            <div className="flex gap-2">
              <button type="button" onClick={closeModal} className="btn-secondary flex-1">
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void saveTank()}
                disabled={saving || !tankName.trim() || tankName.trim() === name}
                className="btn-primary flex-1"
              >
                {saving ? t('common.loading') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
