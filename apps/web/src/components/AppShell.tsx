import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Utensils, Package, LayoutDashboard, MoreHorizontal, Calculator, X, ArrowLeft, ChevronDown } from 'lucide-react';
import { ConnectivityBanner } from '@/hooks/useOnline';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import type { FarmDto } from '@aqualedger/contracts';
import { useState } from 'react';

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  showNav?: boolean;
  onBack?: () => void;
  farmSelector?: boolean;
}

export function AppShell({ children, title, showNav = true, onBack, farmSelector = false }: AppShellProps) {
  const { user, selectedFarmId } = useAuth();
  const navigate = useNavigate();
  const [changeOpen, setChangeOpen] = useState(false);

  const { data: farm } = useQuery({
    queryKey: ['farm', selectedFarmId],
    queryFn: () => api.get<FarmDto>(`/farms/${selectedFarmId}`),
    enabled: !!user && !!selectedFarmId && !farmSelector,
    staleTime: 60_000,
  });

  const showHeader = !!title || farmSelector;

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      <ConnectivityBanner />
      {showHeader && (
        <header className="shrink-0 bg-primary text-white px-4 py-3 z-10 shadow-sm">
          {farmSelector ? (
            <div className="flex items-center gap-2">
              <div className="min-w-touch shrink-0">
                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    className="min-h-touch min-w-touch flex items-center justify-center text-white"
                    aria-label="Back"
                  >
                    <ArrowLeft size={22} />
                  </button>
                )}
              </div>
              <div className="flex-1 flex items-center justify-center min-w-0">
                <FarmHeaderSelect />
              </div>
              <div className="min-w-touch shrink-0" aria-hidden />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    className="min-h-touch min-w-touch flex items-center justify-center text-white shrink-0"
                    aria-label="Back"
                  >
                    <ArrowLeft size={22} />
                  </button>
                )}
                <div className="min-w-0">
                  <h1 className="text-lg font-semibold truncate">{title}</h1>
                  {farm?.name && (
                    <p className="text-xs text-white/80 truncate">{farm.name}</p>
                  )}
                </div>
              </div>
              {user && (
                <button
                  type="button"
                  onClick={() => setChangeOpen(true)}
                  className="text-sm font-medium text-white/90 underline underline-offset-4"
                >
                  Change
                </button>
              )}
            </div>
          )}
        </header>
      )}
      <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
      {showNav && user && (
        <nav className="shrink-0 bg-surface border-t border-border z-30 no-print pb-[env(safe-area-inset-bottom)]">
          <MainNav />
        </nav>
      )}

      {changeOpen && user && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-md space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Change</h3>
              <button type="button" onClick={() => setChangeOpen(false)} className="text-text-secondary">
                <X size={22} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setChangeOpen(false);
                navigate('/feeding/entry');
              }}
              className="btn-secondary"
            >
              Change Tank
            </button>

            <button
              type="button"
              onClick={() => {
                setChangeOpen(false);
                navigate('/select-farm');
              }}
              className="btn-secondary"
            >
              Change Farm
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MainNav() {
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

function FarmHeaderSelect() {
  const { t } = useTranslation();
  const { user, selectedFarmId, setSelectedFarmId } = useAuth();

  const { data: farms, isLoading } = useQuery({
    queryKey: ['farms', user?.id],
    queryFn: () => api.get<FarmDto[]>('/farms'),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <p className="text-sm font-semibold text-white/90">{t('common.loading')}</p>;
  }

  if (!farms?.length) {
    return <p className="text-sm font-semibold text-white/90">{t('farms.noFarms')}</p>;
  }

  return (
    <div className="relative w-full max-w-[220px]">
      <select
        value={selectedFarmId ?? ''}
        onChange={(e) => setSelectedFarmId(e.target.value)}
        className="w-full appearance-none bg-white/15 border border-white/35 text-white font-semibold text-base rounded-lg pl-3 pr-9 py-2 truncate"
        aria-label={t('farms.selectFarm')}
      >
        {farms.map((farm) => (
          <option key={farm.id} value={farm.id} className="text-text-primary">
            {farm.name}
          </option>
        ))}
      </select>
      <ChevronDown size={18} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-white/90" />
    </div>
  );
}

function NavItems({ items }: { items: Array<{ to: string; icon: React.ComponentType<{ size?: number | string }>; label: string }> }) {
  return (
    <div className="flex justify-around items-stretch">
      {items.map(({ to, icon: Icon, label }) => (
        <Link
          key={to}
          to={to}
          className="relative z-10 flex flex-col items-center justify-center py-2 px-3 min-h-touch min-w-touch text-text-secondary hover:text-primary active:text-primary touch-manipulation"
        >
          <Icon size={22} />
          <span className="text-xs mt-0.5 font-medium">{label}</span>
        </Link>
      ))}
    </div>
  );
}
