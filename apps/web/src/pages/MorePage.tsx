import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LogOut, CheckCircle, History, Settings, FileText, UserPlus } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
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

  return (
    <div className="min-h-dvh px-6 py-8 max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-6">{t('login.forgotPin')}</h1>
      <div className="card text-sm text-text-secondary">
        {t(
          'login.forgotPinNoOtp',
          'Forgot PIN? OTP reset is disabled. Please contact your owner to reset your PIN.',
        )}
      </div>
      <a href="/login" className="block mt-4 text-primary text-sm">Back to login</a>
    </div>
  );
}
