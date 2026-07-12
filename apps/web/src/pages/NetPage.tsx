import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { getTodayISO } from '@/lib/utils';

type NetEntry = {
  id: string;
  date: string; // yyyy-mm-dd
  quantity: string; // user-entered numeric string
  createdAt: string;
};

function storageKey(farmId: string) {
  return `aqualedger.net.v1.${farmId}`;
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

export function NetPage() {
  const { t } = useTranslation();
  const { selectedFarmId } = useAuth();
  const [date, setDate] = useState(() => getTodayISO());
  const [quantity, setQuantity] = useState('');
  const [tick, setTick] = useState(0);

  const entries = useMemo(() => {
    if (!selectedFarmId) return [];
    const all = readEntries(selectedFarmId);
    return all.slice().sort((a, b) => (b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)));
  }, [selectedFarmId, tick]);

  const save = () => {
    if (!selectedFarmId) return;
    const q = String(quantity || '').trim();
    if (!q || Number.isNaN(Number(q))) return;
    const next: NetEntry = {
      id: crypto.randomUUID(),
      date,
      quantity: q,
      createdAt: new Date().toISOString(),
    };
    const all = readEntries(selectedFarmId);
    all.push(next);
    writeEntries(selectedFarmId, all);
    setQuantity('');
    setTick((n) => n + 1);
  };

  const remove = (id: string) => {
    if (!selectedFarmId) return;
    const all = readEntries(selectedFarmId).filter((e) => e.id !== id);
    writeEntries(selectedFarmId, all);
    setTick((n) => n + 1);
  };

  return (
    <AppShell title={t('net.title')}>
      <div className="px-4 py-4 space-y-4">
        <div className="card space-y-3">
          <div>
            <label className="label">{t('net.date')}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-field text-base"
            />
          </div>
          <div>
            <label className="label">{t('net.quantity')}</label>
            <input
              value={quantity}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '' || /^\d*\.?\d{0,3}$/.test(v)) setQuantity(v);
              }}
              inputMode="decimal"
              placeholder="0.0"
              className="input-field text-base"
            />
          </div>
          <button type="button" onClick={save} disabled={!selectedFarmId || !quantity} className="btn-primary">
            {t('common.save')}
          </button>
        </div>

        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.id} className="card flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{e.date}</p>
                <p className="text-sm text-text-secondary">{e.quantity}</p>
              </div>
              <button type="button" onClick={() => remove(e.id)} className="btn-secondary !py-2 !text-sm">
                {t('common.delete')}
              </button>
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

