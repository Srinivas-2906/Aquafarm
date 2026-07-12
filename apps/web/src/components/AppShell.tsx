import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Utensils, Package, LayoutDashboard, MoreHorizontal, Calculator, FileText } from 'lucide-react';
import { ConnectivityBanner } from '@/hooks/useOnline';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/types/roles';

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  showNav?: boolean;
}

export function AppShell({ children, title, showNav = true }: AppShellProps) {
  const { user } = useAuth();
  const isOwner = user?.role === UserRole.OWNER;

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <ConnectivityBanner />
      {title && (
        <header className="bg-primary text-white px-4 py-3 sticky top-0 z-10 shadow-sm">
          <h1 className="text-lg font-semibold">{title}</h1>
        </header>
      )}
      <main className="flex-1 pb-20 overflow-y-auto">{children}</main>
      {showNav && user && (
        <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border z-20 no-print">
          {isOwner ? <OwnerNav /> : <SupervisorNav />}
        </nav>
      )}
    </div>
  );
}

function SupervisorNav() {
  const { t } = useTranslation();
  const items = [
    { to: '/', icon: Home, label: t('nav.home') },
    { to: '/feeding', icon: Utensils, label: t('nav.feeding') },
    { to: '/inventory', icon: Package, label: t('nav.inventory') },
    { to: '/records', icon: FileText, label: t('nav.records') },
  ];
  return <NavItems items={items} />;
}

function OwnerNav() {
  const { t } = useTranslation();
  const items = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/feeding', icon: Utensils, label: t('nav.feeding') },
    { to: '/inventory', icon: Package, label: t('nav.inventory') },
    { to: '/net', icon: Calculator, label: t('nav.net') },
    { to: '/more', icon: MoreHorizontal, label: t('nav.more') },
  ];
  return <NavItems items={items} />;
}

function NavItems({ items }: { items: Array<{ to: string; icon: React.ComponentType<{ size?: number | string }>; label: string }> }) {
  return (
    <div className="flex justify-around items-stretch">
      {items.map(({ to, icon: Icon, label }) => (
        <Link
          key={to}
          to={to}
          className="flex flex-col items-center justify-center py-2 px-3 min-h-touch min-w-touch text-text-secondary hover:text-primary active:text-primary"
        >
          <Icon size={22} />
          <span className="text-xs mt-0.5 font-medium">{label}</span>
        </Link>
      ))}
    </div>
  );
}
