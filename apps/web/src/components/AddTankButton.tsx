import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { PondDto } from '@aqualedger/contracts';

function suggestNextTankCode(ponds: PondDto[] | undefined) {
  const codes = (ponds ?? [])
    .map((p) => parseInt(p.code, 10))
    .filter((n) => !Number.isNaN(n));
  if (codes.length === 0) return '1';
  return String(Math.max(...codes) + 1);
}

type AddTankButtonProps = {
  onCreated?: (pond: PondDto) => void;
  className?: string;
  compact?: boolean;
};

export function AddTankButton({ onCreated, className, compact = false }: AddTankButtonProps) {
  const { t } = useTranslation();
  const { selectedFarmId } = useAuth();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [tankName, setTankName] = useState('');
  const [tankCode, setTankCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: ponds } = useQuery({
    queryKey: ['ponds', selectedFarmId],
    queryFn: () => api.get<PondDto[]>(`/farms/${selectedFarmId}/ponds`),
    enabled: !!selectedFarmId,
  });

  const nextCode = useMemo(() => suggestNextTankCode(ponds), [ponds]);

  const openModal = () => {
    setOpen(true);
    setError(null);
    setTankName('');
    setTankCode(nextCode);
  };

  const closeModal = () => setOpen(false);

  const saveTank = async () => {
    if (!selectedFarmId || !tankName.trim() || !tankCode.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<PondDto>(`/farms/${selectedFarmId}/ponds`, {
        name: tankName.trim(),
        code: tankCode.trim(),
        type: 'TANK',
      });
      await queryClient.invalidateQueries({ queryKey: ['ponds', selectedFarmId] });
      await queryClient.invalidateQueries({ queryKey: ['pond-status', selectedFarmId] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', selectedFarmId] });
      setOpen(false);
      onCreated?.(created);
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
        onClick={openModal}
        className={cn(
          compact
            ? 'btn-secondary btn-inline flex items-center gap-1.5 !py-2 !px-3 !text-sm !min-h-0'
            : 'btn-secondary flex items-center justify-center gap-2',
          className,
        )}
      >
        <Plus size={compact ? 16 : 18} />
        {t('tanks.addTank')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">{t('tanks.addTank')}</h3>
              <button type="button" onClick={closeModal} className="text-text-secondary">
                <X size={22} />
              </button>
            </div>

            <div>
              <label className="label">{t('tanks.tankName')}</label>
              <input value={tankName} onChange={(e) => setTankName(e.target.value)} className="input-field text-base" />
            </div>

            <div>
              <label className="label">{t('tanks.tankCode')}</label>
              <input value={tankCode} onChange={(e) => setTankCode(e.target.value)} className="input-field text-base" />
            </div>

            {error && <p className="text-danger text-sm">{error}</p>}

            <div className="flex gap-2">
              <button type="button" onClick={closeModal} className="btn-secondary flex-1">
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void saveTank()}
                disabled={saving || !tankName.trim() || !tankCode.trim()}
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
