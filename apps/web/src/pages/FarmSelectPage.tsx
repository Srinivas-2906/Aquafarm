import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/roles';
import { api, ApiError } from '@/lib/api';
import type { FarmDto } from '@aqualedger/contracts';

export function FarmSelectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, setSelectedFarmId } = useAuth();
  const queryClient = useQueryClient();

  const [showAddFarm, setShowAddFarm] = useState(false);
  const [farmName, setFarmName] = useState('');
  const [farmLocation, setFarmLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: farms, isLoading } = useQuery({
    queryKey: ['farms'],
    queryFn: () => api.get<FarmDto[]>('/farms'),
  });

  const farmOptions = useMemo(() => farms ?? [], [farms]);

  const onSelectFarm = (farmId: string) => {
    setSelectedFarmId(farmId);
    if (user?.role === UserRole.OWNER) navigate('/dashboard');
    else navigate('/');
  };

  const openAddFarm = () => {
    setShowAddFarm(true);
    setError(null);
    setFarmName('');
    setFarmLocation('');
  };

  const saveFarm = async () => {
    if (!farmName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<FarmDto>('/farms', {
        name: farmName.trim(),
        location: farmLocation.trim() || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ['farms'] });
      setShowAddFarm(false);
      onSelectFarm(created.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title={t('farms.selectTitle')}>
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-text-secondary min-w-0">{t('farms.tapToOpen')}</p>
          <button
            type="button"
            onClick={openAddFarm}
            className="btn-secondary btn-inline flex items-center gap-1.5 !py-2 !px-3 !text-sm !min-h-0 shrink-0"
          >
            <Plus size={16} />
            {t('farms.addFarm')}
          </button>
        </div>

        {isLoading && <p className="text-center text-text-secondary py-6">{t('common.loading')}</p>}

        <div className="grid grid-cols-2 gap-3">
          {farmOptions.map((farm) => (
            <button
              key={farm.id}
              type="button"
              className="card text-left min-h-[96px] border-2 border-primary/30 bg-primary-light/40 hover:border-primary active:scale-[0.98] transition-all"
              onClick={() => onSelectFarm(farm.id)}
            >
              <p className="font-bold text-base text-primary leading-tight truncate">{farm.name}</p>
              {farm.location && (
                <p className="text-xs text-text-secondary mt-2 line-clamp-2">{farm.location}</p>
              )}
            </button>
          ))}
        </div>

        {!isLoading && farmOptions.length === 0 && (
          <div className="card space-y-3">
            <p className="text-sm text-text-secondary">{t('farms.noFarms')}</p>
            <button type="button" onClick={openAddFarm} className="btn-secondary flex items-center justify-center gap-2">
              <Plus size={18} />
              {t('farms.addFarm')}
            </button>
          </div>
        )}

        {showAddFarm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
            <div className="card w-full max-w-md space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">{t('farms.addTitle')}</h3>
                <button type="button" onClick={() => setShowAddFarm(false)} className="text-text-secondary">
                  <X size={22} />
                </button>
              </div>

              <div>
                <label className="label">{t('farms.name')}</label>
                <input value={farmName} onChange={(e) => setFarmName(e.target.value)} className="input-field text-base" />
              </div>

              <div>
                <label className="label">{t('farms.location')}</label>
                <input value={farmLocation} onChange={(e) => setFarmLocation(e.target.value)} className="input-field text-base" />
              </div>

              {error && <p className="text-danger text-sm">{error}</p>}

              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddFarm(false)} className="btn-secondary flex-1">
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void saveFarm()}
                  disabled={saving || !farmName.trim()}
                  className="btn-primary flex-1"
                >
                  {saving ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
