import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';

function generatePin(): string {
  // 6 digits, avoids leading zeros only for nicer sharing
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function InviteSupervisorPage() {
  const { t } = useTranslation();
  const { selectedFarmId } = useAuth();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState(() => generatePin());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const canSubmit = useMemo(() => /^[6-9]\d{9}$/.test(phone) && /^\d{6}$/.test(pin), [phone, pin]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFarmId) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.post('/auth/invite-supervisor', {
        farmId: selectedFarmId,
        phoneNumber: phone,
        pin,
      });
      setSuccess(
        t(
          'inviteSupervisor.success',
          'Supervisor invited. Share the phone number and temporary PIN with them.',
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell title={t('inviteSupervisor.title', 'Invite Supervisor')}>
      <div className="px-4 py-4 space-y-4">
        <div className="card text-sm text-text-secondary">
          {t(
            'inviteSupervisor.help',
            'Enter the supervisor phone number and a temporary PIN. They will be forced to set their own PIN on first login.',
          )}
        </div>

        <form onSubmit={submit} className="card space-y-3">
          <div>
            <label className="label">{t('inviteSupervisor.phone', 'Phone number')}</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              className="input-field"
              placeholder="9985533376"
              inputMode="numeric"
              maxLength={10}
              required
            />
          </div>

          <div>
            <label className="label">{t('inviteSupervisor.tempPin', 'Temporary PIN')}</label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="input-field"
              placeholder="123456"
              inputMode="numeric"
              maxLength={6}
              required
            />
            <button
              type="button"
              className="btn-secondary mt-2 !text-sm"
              onClick={() => setPin(generatePin())}
            >
              {t('inviteSupervisor.generatePin', 'Generate PIN')}
            </button>
          </div>

          {error && <div className="card border-danger text-danger text-sm">{error}</div>}
          {success && <div className="card border-success text-success text-sm">{success}</div>}

          <button type="submit" className="btn-primary" disabled={loading || !selectedFarmId || !canSubmit}>
            {loading ? t('common.loading') : t('inviteSupervisor.invite', 'Invite Supervisor')}
          </button>
        </form>

        <div className="card space-y-2">
          <p className="font-medium">{t('inviteSupervisor.shareTitle', 'Share with supervisor')}</p>
          <p className="text-sm text-text-secondary">
            {t('inviteSupervisor.shareLine', 'Phone')}:{' '}
            <span className="font-mono text-text-primary">{phone || '—'}</span>
          </p>
          <p className="text-sm text-text-secondary">
            {t('inviteSupervisor.sharePin', 'Temporary PIN')}:{' '}
            <span className="font-mono text-text-primary">{pin || '—'}</span>
          </p>
        </div>
      </div>
    </AppShell>
  );
}

