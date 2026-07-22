import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/roles';
import { api, ApiError } from '@/lib/api';
import type { FarmDto } from '@aqualedger/contracts';

type FarmFormMode = 'add' | 'edit';

export function FarmSelectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, selectedFarmId, setSelectedFarmId } = useAuth();
  const queryClient = useQueryClient();
  const isOwner = user?.role === UserRole.OWNER;
  const returning = !!selectedFarmId;

  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<FarmFormMode>('add');
  const [editingFarm, setEditingFarm] = useState<FarmDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FarmDto | null>(null);
  const [farmName, setFarmName] = useState('');
  const [farmLocation, setFarmLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: farms, isLoading } = useQuery({
    queryKey: ['farms', user?.id],
    queryFn: () => api.get<FarmDto[]>('/farms'),
  });

  const farmOptions = useMemo(() => farms ?? [], [farms]);

  const invalidateFarmQueries = async (farmId?: string) => {
    await queryClient.invalidateQueries({ queryKey: ['farms'] });
    if (farmId) {
      await queryClient.invalidateQueries({ queryKey: ['farm', farmId] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', farmId] });
    }
  };

  const onSelectFarm = (farmId: string) => {
    setSelectedFarmId(farmId);
    if (isOwner) navigate('/dashboard');
    else navigate('/');
  };

  const goBack = () => {
    if (isOwner) navigate('/dashboard');
    else navigate('/');
  };

  const openAddFarm = () => {
    setFormMode('add');
    setEditingFarm(null);
    setFarmName('');
    setFarmLocation('');
    setError(null);
    setShowForm(true);
  };

  const openEditFarm = (farm: FarmDto) => {
    setFormMode('edit');
    setEditingFarm(farm);
    setFarmName(farm.name);
    setFarmLocation(farm.location ?? '');
    setError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingFarm(null);
    setError(null);
  };

  const saveFarm = async () => {
    if (!farmName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (formMode === 'add') {
        const created = await api.post<FarmDto>('/farms', {
          name: farmName.trim(),
          location: farmLocation.trim() || undefined,
        });
        await invalidateFarmQueries(created.id);
        closeForm();
        onSelectFarm(created.id);
      } else if (editingFarm) {
        const updated = await api.patch<FarmDto>(`/farms/${editingFarm.id}`, {
          name: farmName.trim(),
          location: farmLocation.trim() || undefined,
        });
        await invalidateFarmQueries(updated.id);
        closeForm();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/farms/${deleteTarget.id}`);
      const remaining = farmOptions.filter((farm) => farm.id !== deleteTarget.id);
      await invalidateFarmQueries(deleteTarget.id);

      if (selectedFarmId === deleteTarget.id) {
        if (remaining.length > 0) {
          setSelectedFarmId(remaining[0].id);
        } else {
          setSelectedFarmId(null);
        }
      }

      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.error'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppShell
      title={returning ? t('farms.manageTitle') : t('farms.selectTitle')}
      showNav={false}
      onBack={returning ? goBack : undefined}
    >
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-text-secondary min-w-0">
            {returning ? t('farms.manageSummary', { count: farmOptions.length }) : t('farms.tapToOpen')}
          </p>
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

        <div className="grid grid-cols-2 gap-2">
          {farmOptions.map((farm) => {
            const isSelected = farm.id === selectedFarmId;
            return (
              <div
                key={farm.id}
                className={`card !p-2.5 text-left border transition-all ${
                  isSelected
                    ? 'border-primary bg-primary-light/40'
                    : 'border-primary/25 bg-primary-light/20 hover:border-primary/50'
                }`}
              >
                <div className="flex items-start gap-1.5">
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left"
                    onClick={() => onSelectFarm(farm.id)}
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      <p className="font-semibold text-sm text-primary leading-tight truncate">{farm.name}</p>
                      {isSelected && (
                        <span className="shrink-0 text-[9px] font-semibold uppercase text-primary">
                          {t('farms.current')}
                        </span>
                      )}
                    </div>
                    {farm.location && (
                      <p className="text-[11px] text-text-secondary mt-0.5 truncate">{farm.location}</p>
                    )}
                  </button>

                  {isOwner && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditFarm(farm)}
                        className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-text-secondary hover:text-primary hover:border-primary/40"
                        aria-label={t('farms.editFarm')}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setDeleteTarget(farm);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-text-secondary hover:text-danger hover:border-danger/40"
                        aria-label={t('farms.deleteFarm')}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
            <div className="card w-full max-w-md space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">
                  {formMode === 'add' ? t('farms.addTitle') : t('farms.editTitle')}
                </h3>
                <button type="button" onClick={closeForm} className="text-text-secondary">
                  <X size={22} />
                </button>
              </div>

              <div>
                <label className="label">{t('farms.name')}</label>
                <input value={farmName} onChange={(e) => setFarmName(e.target.value)} className="input-field text-base" autoFocus />
              </div>

              <div>
                <label className="label">{t('farms.location')}</label>
                <input value={farmLocation} onChange={(e) => setFarmLocation(e.target.value)} className="input-field text-base" />
              </div>

              {error && <p className="text-danger text-sm">{error}</p>}

              <div className="flex gap-2">
                <button type="button" onClick={closeForm} className="btn-secondary flex-1">
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void saveFarm()}
                  disabled={
                    saving ||
                    !farmName.trim() ||
                    (formMode === 'edit' &&
                      !!editingFarm &&
                      farmName.trim() === editingFarm.name &&
                      (farmLocation.trim() || '') === (editingFarm.location ?? ''))
                  }
                  className="btn-primary flex-1"
                >
                  {saving ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
            <div className="card w-full max-w-md space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">{t('farms.deleteTitle')}</h3>
                <button type="button" onClick={() => setDeleteTarget(null)} className="text-text-secondary">
                  <X size={22} />
                </button>
              </div>

              <p className="text-sm text-text-secondary">
                {t('farms.deleteConfirm', { name: deleteTarget.name })}
              </p>

              {error && <p className="text-danger text-sm">{error}</p>}

              <div className="flex gap-2">
                <button type="button" onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1">
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDelete()}
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
    </AppShell>
  );
}
