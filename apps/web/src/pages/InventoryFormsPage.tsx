import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import { AppShell } from '@/components/AppShell';
import { NumericQuantityInput } from '@/components/NumericQuantityInput';
import { useAuth } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';
import { getTodayISO } from '@/lib/utils';
import type { FeedProductDto } from '@aqualedger/contracts';

export function ReceiveFeedPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedFarmId } = useAuth();
  const [feedProductId, setFeedProductId] = useState('');
  const [bags, setBags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: products } = useQuery({
    queryKey: ['feed-products', selectedFarmId],
    queryFn: () => api.get<FeedProductDto[]>(`/farms/${selectedFarmId}/feed-products`),
    enabled: !!selectedFarmId,
  });

  const selected = products?.find((p) => p.id === feedProductId);
  const totalKg = selected && bags
    ? (parseFloat(bags) * parseFloat(selected.bagWeightKg)).toFixed(3)
    : '0';

  const handleSave = async () => {
    if (!feedProductId || !bags) return;
    setSaving(true);
    setError('');
    try {
      await api.post('/inventory/transactions', {
        clientTransactionId: uuidv4(),
        farmId: selectedFarmId,
        feedProductId,
        type: 'FEED_RECEIVED',
        quantityKg: totalKg,
        transactionDate: getTodayISO(),
        numberOfBags: parseInt(bags),
      });
      navigate('/inventory');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title={t('inventory.receive')} showNav={false}>
      <div className="px-4 py-4 space-y-4">
        <div>
          <label className="label">Feed Product</label>
          <select
            value={feedProductId}
            onChange={(e) => setFeedProductId(e.target.value)}
            className="input-field text-base"
          >
            <option value="">Select feed code</option>
            {products?.map((p) => (
              <option key={p.id} value={p.id}>{p.feedCode} — {p.brandName}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Number of Bags</label>
          <input
            type="number"
            inputMode="numeric"
            value={bags}
            onChange={(e) => setBags(e.target.value)}
            className="input-field"
            min="1"
          />
        </div>

        {selected && (
          <div className="card bg-primary-light">
            <p className="text-sm">Bag weight: {selected.bagWeightKg} kg</p>
            <p className="text-xl font-bold">Total: {totalKg} kg</p>
          </div>
        )}

        {error && <p className="text-danger text-sm">{error}</p>}

        <button onClick={handleSave} disabled={saving || !feedProductId || !bags} className="btn-primary">
          {saving ? t('common.loading') : t('common.save')}
        </button>
      </div>
    </AppShell>
  );
}

export function DamageFeedPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { selectedFarmId } = useAuth();
  const [feedProductId, setFeedProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: products } = useQuery({
    queryKey: ['feed-products', selectedFarmId],
    queryFn: () => api.get<FeedProductDto[]>(`/farms/${selectedFarmId}/feed-products`),
    enabled: !!selectedFarmId,
  });

  const handleSave = async () => {
    if (!feedProductId || !quantity) return;
    setSaving(true);
    try {
      await api.post('/inventory/transactions', {
        clientTransactionId: uuidv4(),
        farmId: selectedFarmId,
        feedProductId,
        type: 'DAMAGED',
        quantityKg: quantity,
        transactionDate: getTodayISO(),
        remarks: reason,
      });
      navigate('/inventory');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title={t('inventory.damage')} showNav={false}>
      <div className="px-4 py-4 space-y-4">
        <div>
          <label className="label">Feed Product</label>
          <select value={feedProductId} onChange={(e) => setFeedProductId(e.target.value)} className="input-field">
            <option value="">Select</option>
            {products?.map((p) => (
              <option key={p.id} value={p.id}>{p.feedCode}</option>
            ))}
          </select>
        </div>
        <NumericQuantityInput value={quantity} onChange={setQuantity} label="Quantity (kg)" />
        <div>
          <label className="label">Reason</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="input-field text-base" />
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary">{t('common.save')}</button>
      </div>
    </AppShell>
  );
}
