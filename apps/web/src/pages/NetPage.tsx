import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { getTodayISO } from '@/lib/utils';
import type { PondDto } from '@aqualedger/contracts';

type NetEntry = {
  id: string;
  pondId: string;
  pondName: string;
  pondCode: string;
  date: string;
  bodyWeight: string;
  createdAt: string;
};

function storageKey(farmId: string) {
  return `aqualedger.net.v2.${farmId}`;
}

function readEntries(farmId: string): NetEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(farmId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean) as NetEntry[];
  } catch {
    return [];
  }
}

function writeEntries(farmId: string, entries: NetEntry[]) {
  localStorage.setItem(storageKey(farmId), JSON.stringify(entries));
}

function parseBodyWeight(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+(\.\d{1,3})?$/.test(trimmed)) return null;
  const n = parseFloat(trimmed);
  if (Number.isNaN(n) || n <= 0) return null;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, '');
}

function formatNetDate(dateISO: string): string {
  const [year, month, day] = dateISO.split('-').map(Number);
  if (!year || !month || !day) return dateISO;
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function NetPage() {
  const { t } = useTranslation();
  const { selectedFarmId } = useAuth();
  const [pondId, setPondId] = useState('');
  const [pondName, setPondName] = useState('');
  const [pondCode, setPondCode] = useState('');
  const [date, setDate] = useState(() => getTodayISO());
  const [bodyWeight, setBodyWeight] = useState('');
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: ponds, isLoading } = useQuery({
    queryKey: ['ponds', selectedFarmId],
    queryFn: () => api.get<PondDto[]>(`/farms/${selectedFarmId}/ponds`),
    enabled: !!selectedFarmId,
  });

  useEffect(() => {
    setPondId('');
    setPondName('');
    setPondCode('');
    setBodyWeight('');
    setError(null);
    setSaved(false);
  }, [selectedFarmId]);

  const entries = useMemo(() => {
    if (!selectedFarmId) return [];
    const all = readEntries(selectedFarmId);
    return all
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [selectedFarmId, tick]);

  const handleTankChange = (id: string) => {
    setPondId(id);
    const pond = ponds?.find((p) => p.id === id);
    setPondName(pond?.name || '');
    setPondCode(pond?.code || '');
    setError(null);
    setSaved(false);
  };

  const save = () => {
    if (!selectedFarmId) {
      setError(t('net.noFarm'));
      return;
    }
    if (!pondId || !pondName) {
      setError(t('net.selectTank'));
      return;
    }

    const weight = parseBodyWeight(bodyWeight);
    if (!weight) {
      setError(t('net.invalidBodyWeight'));
      return;
    }
    if (!date) {
      setError(t('net.invalidDate'));
      return;
    }

    try {
      const next: NetEntry = {
        id: uuidv4(),
        pondId,
        pondName,
        pondCode,
        date,
        bodyWeight: weight,
        createdAt: new Date().toISOString(),
      };

      const all = readEntries(selectedFarmId);
      all.push(next);
      writeEntries(selectedFarmId, all);
      setBodyWeight('');
      setError(null);
      setSaved(true);
      setTick((n) => n + 1);
    } catch {
      setError(t('common.error'));
      setSaved(false);
    }
  };

  const remove = (id: string) => {
    if (!selectedFarmId) return;
    try {
      const all = readEntries(selectedFarmId).filter((e) => e.id !== id);
      writeEntries(selectedFarmId, all);
      setTick((n) => n + 1);
    } catch {
      setError(t('common.error'));
    }
  };

  const canSave = !!selectedFarmId && !!pondId && !!parseBodyWeight(bodyWeight) && !!date;

  return (
    <AppShell title={t('net.title')}>
      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        <div className="card space-y-3">
          <div>
            <label className="label">{t('net.tank')}</label>
            <select
              value={pondId}
              onChange={(e) => handleTankChange(e.target.value)}
              className="input-field text-base"
              disabled={isLoading || !ponds?.length}
            >
              <option value="">{isLoading ? t('common.loading') : t('net.selectTank')}</option>
              {ponds?.map((pond) => (
                <option key={pond.id} value={pond.id}>
                  {pond.name} (#{pond.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">{t('net.bodyWeight')}</label>
            <input
              value={bodyWeight}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || /^\d*\.?\d{0,3}$/.test(v)) {
                  setBodyWeight(v);
                  setSaved(false);
                  setError(null);
                }
              }}
              inputMode="decimal"
              placeholder="0.0"
              className="input-field text-base"
            />
          </div>

          <div>
            <label className="label">{t('net.date')}</label>
            <input
              type="date"
              value={date}
              max={getTodayISO()}
              onChange={(e) => {
                setDate(e.target.value);
                setSaved(false);
                setError(null);
              }}
              className="input-compact !py-2 !text-base w-[170px]"
            />
          </div>

          {error && <p className="text-danger text-sm">{error}</p>}
          {saved && <p className="text-success text-sm font-medium">{t('feeding.saved')}</p>}

          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="btn-primary"
          >
            {t('common.save')}
          </button>
        </div>

        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-base leading-snug min-w-0 flex-1">
                  {entry.pondName}
                  {entry.pondCode ? ` (#${entry.pondCode})` : ''}
                </p>
                <button
                  type="button"
                  onClick={() => remove(entry.id)}
                  className="btn-secondary btn-inline !min-h-0 !py-1.5 !px-3 !text-xs shrink-0"
                >
                  {t('common.delete')}
                </button>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-text-secondary whitespace-nowrap">
                  {formatNetDate(entry.date)}
                </span>
                <span className="font-semibold text-primary whitespace-nowrap">
                  {entry.bodyWeight} g
                </span>
              </div>
            </div>
          ))}
          {entries.length === 0 && (
            <p className="text-center text-text-secondary py-6">{t('net.empty')}</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
