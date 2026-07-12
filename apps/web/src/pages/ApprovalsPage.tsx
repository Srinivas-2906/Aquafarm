import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import type { ApprovalItemDto } from '@aqualedger/contracts';

export function ApprovalsPage() {
  const { t } = useTranslation();
  const { selectedFarmId } = useAuth();

  const { data, refetch } = useQuery({
    queryKey: ['approvals', selectedFarmId],
    queryFn: () => api.get<ApprovalItemDto[]>(`/approvals?farmId=${selectedFarmId}`),
    enabled: !!selectedFarmId,
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/approvals/${id}/approve`),
    onSuccess: () => refetch(),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/approvals/${id}/reject`, { reason }),
    onSuccess: () => refetch(),
  });

  return (
    <AppShell title={t('approvals.title')}>
      <div className="px-4 py-4 space-y-3">
        {data?.length === 0 && (
          <p className="text-center text-text-secondary py-8">No pending approvals</p>
        )}
        {data?.map((item) => (
          <ApprovalCard
            key={item.id}
            item={item}
            onApprove={() => approve.mutate(item.id)}
            onReject={(reason) => reject.mutate({ id: item.id, reason })}
          />
        ))}
      </div>
    </AppShell>
  );
}

function ApprovalCard({
  item,
  onApprove,
  onReject,
}: {
  item: ApprovalItemDto;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <div className="card space-y-3">
      <div>
        <h3 className="font-bold">{item.pondName}</h3>
        <p className="text-sm text-text-secondary">
          {item.supervisorName} — {item.entryDate}
        </p>
        <p className="text-sm">{item.reason}</p>
      </div>
      {item.totalFeedKg && <p className="text-lg font-semibold">{item.totalFeedKg} kg</p>}
      {item.meals && (
        <div className="text-sm">
          {item.meals.map((m) => (
            <p key={m.mealNumber}>Meal {m.mealNumber}: {m.feedQuantityKg} kg</p>
          ))}
        </div>
      )}
      {showReject ? (
        <div className="space-y-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input-field text-base"
            placeholder="Reason for rejection"
          />
          <div className="flex gap-2">
            <button onClick={() => setShowReject(false)} className="btn-secondary flex-1">{t('common.cancel')}</button>
            <button onClick={() => onReject(reason)} className="btn-primary flex-1 bg-danger">{t('approvals.reject')}</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={onApprove} className="btn-primary flex-1">{t('approvals.approve')}</button>
          <button onClick={() => setShowReject(true)} className="btn-secondary flex-1">{t('approvals.reject')}</button>
        </div>
      )}
    </div>
  );
}
