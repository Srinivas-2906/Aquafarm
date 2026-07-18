import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LogOut, CheckCircle, History, Settings, FileText, UserPlus } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { api, authApi, ApiError } from '@/lib/api';
import { UserRole } from '@/types/roles';

export function MorePage() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();

  const isOwner = user?.role === UserRole.OWNER;

  const items = [
    // Always available
    { to: '/records', icon: FileText, label: t('nav.records') },
    // Owner-only items (routes + APIs are still owner-only)
    ...(isOwner
      ? [
          { to: '/reports', icon: FileText, label: t('nav.reports') },
          { to: '/invite-supervisor', icon: UserPlus, label: t('inviteSupervisor.title', 'Invite Supervisor') },
          { to: '/approvals', icon: CheckCircle, label: t('approvals.title') },
          { to: '/audit', icon: History, label: 'Audit History' },
          { to: '/settings', icon: Settings, label: 'Farm Settings' },
        ]
      : []),
  ];

  return (
    <AppShell title={t('nav.more')}>
      <div className="px-4 py-4 space-y-4">
        <div className="card">
          <p className="font-semibold">{user?.displayName}</p>
          <p className="text-sm text-text-secondary">{user?.phoneNumber}</p>
        </div>

        <div>
          <label className="label">Language</label>
          <select
            value={i18n.language}
            onChange={(e) => {
              i18n.changeLanguage(e.target.value);
              localStorage.setItem('language', e.target.value);
            }}
            className="input-field text-base"
          >
            <option value="en">English</option>
            <option value="te">తెలుగు</option>
          </select>
        </div>

        <div className="space-y-2">
          {items.map(({ to, icon: Icon, label }) => (
            <Link key={to} to={to} className="card flex items-center gap-3 min-h-touch no-underline text-text-primary">
              <Icon size={22} className="text-primary" />
              <span className="font-medium">{label}</span>
            </Link>
          ))}
        </div>

        <button onClick={() => logout()} className="btn-secondary flex items-center justify-center gap-2 text-danger border-danger">
          <LogOut size={20} />
          Logout
        </button>
      </div>
    </AppShell>
  );
}

export function AuditPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: () =>
      api.get<{
        data: Array<{
          id: string;
          userName: string;
          action: string;
          entityType: string;
          serverTimestamp: string;
          reason: string | null;
        }>;
      }>('/audit-logs'),
  });

  return (
    <AppShell title="Audit History">
      <div className="px-4 py-4 space-y-2">
        {isLoading && <p>Loading...</p>}
        {data?.data.map((log) => (
          <div key={log.id} className="card text-sm">
            <p className="font-medium">{log.userName} — {log.action}</p>
            <p className="text-text-secondary">
              {log.entityType} — {new Date(log.serverTimestamp).toLocaleString()}
            </p>
            {log.reason && <p className="text-xs">{log.reason}</p>}
          </div>
        ))}
      </div>
    </AppShell>
  );
}

export function SettingsPage() {
  return (
    <AppShell title="Farm Settings">
      <div className="px-4 py-4">
        <p className="text-text-secondary">Farm configuration available to owners.</p>
      </div>
    </AppShell>
  );
}

export function ResetPinPage() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const result = await authApi.requestPinReset(phone, message || undefined);
      setSuccess(result.message);
      setPhone('');
      setMessage('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh px-6 py-8 max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-2">{t('login.forgotPin', 'Forgot PIN?')}</h1>
      <p className="text-sm text-text-secondary mb-6">
        Submit a request and admin will reset your PIN.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="resetPhone">{t('login.phone')}</label>
          <input
            id="resetPhone"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            className="input-field"
            placeholder="9985533376"
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="resetMessage">Note (optional)</label>
          <textarea
            id="resetMessage"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="input-field min-h-[80px]"
            placeholder="e.g. forgot PIN after phone change"
            maxLength={500}
          />
        </div>

        {error && (
          <p className="text-danger text-sm bg-danger/10 p-3 rounded-lg" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="text-success text-sm bg-success/10 p-3 rounded-lg" role="status">
            {success}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? t('common.loading') : 'Submit request'}
        </button>
      </form>

      <Link to="/login" className="block mt-4 text-primary text-sm">Back to login</Link>
    </div>
  );
}
