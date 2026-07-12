import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

export function FeedProductFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { feedProductId } = useParams();
  const queryClient = useQueryClient();
  const { selectedFarmId } = useAuth();
  const isEdit = !!feedProductId;

  const [feedCode, setFeedCode] = useState('');
  const [brandName, setBrandName] = useState('');
  const [pelletSize, setPelletSize] = useState('');
  const [bagWeightKg, setBagWeightKg] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [lowStockThresholdKg, setLowStockThresholdKg] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: product, isLoading } = useQuery({
    queryKey: ['feed-product', feedProductId],
    queryFn: () => api.get<FeedProductDto>(`/feed-products/${feedProductId}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (!product) return;
    setFeedCode(product.feedCode);
    setBrandName(product.brandName);
    setPelletSize(product.pelletSize || '');
    setBagWeightKg(product.bagWeightKg);
    setSupplierName(product.supplierName || '');
    setLowStockThresholdKg(product.lowStockThresholdKg || '');
  }, [product]);

  const handleSave = async () => {
    if (!selectedFarmId || !feedCode || !brandName || !bagWeightKg) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        feedCode: feedCode.trim(),
        brandName: brandName.trim(),
        pelletSize: pelletSize.trim() || undefined,
        bagWeightKg,
        supplierName: supplierName.trim() || undefined,
        lowStockThresholdKg: lowStockThresholdKg || undefined,
      };

      if (isEdit && feedProductId) {
        await api.patch(`/feed-products/${feedProductId}`, payload);
      } else {
        await api.post(`/farms/${selectedFarmId}/feed-products`, payload);
      }

      await queryClient.invalidateQueries({ queryKey: ['inventory-summary', selectedFarmId] });
      await queryClient.invalidateQueries({ queryKey: ['feed-products', selectedFarmId] });
      navigate('/inventory');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title={isEdit ? t('inventory.editFeed') : t('inventory.addFeed')} showNav={false}>
      <div className="px-4 py-4 space-y-4">
        {isLoading && isEdit ? (
          <p className="text-center py-8">{t('common.loading')}</p>
        ) : (
          <>
            <div>
              <label className="label">{t('feeding.feedCode')}</label>
              <input
                value={feedCode}
                onChange={(e) => setFeedCode(e.target.value.toUpperCase())}
                className="input-field text-base"
                placeholder="1C"
              />
            </div>

            <div>
              <label className="label">{t('inventory.brandName')}</label>
              <input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="input-field text-base"
              />
            </div>

            <div>
              <label className="label">{t('inventory.pelletSize')}</label>
              <input
                value={pelletSize}
                onChange={(e) => setPelletSize(e.target.value)}
                className="input-field text-base"
                placeholder="1.2mm"
              />
            </div>

            <NumericQuantityInput
              value={bagWeightKg}
              onChange={setBagWeightKg}
              label={t('inventory.bagWeight')}
            />

            <div>
              <label className="label">{t('inventory.supplier')}</label>
              <input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="input-field text-base"
              />
            </div>

            <NumericQuantityInput
              value={lowStockThresholdKg}
              onChange={setLowStockThresholdKg}
              label={t('inventory.lowStockThreshold')}
            />

            {error && <p className="text-danger text-sm">{error}</p>}

            <button
              onClick={handleSave}
              disabled={saving || !feedCode || !brandName || !bagWeightKg}
              className="btn-primary"
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </>
        )}
      </div>
    </AppShell>
  );
}
