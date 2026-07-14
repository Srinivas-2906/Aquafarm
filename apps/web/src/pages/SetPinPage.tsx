import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api, ApiError } from '@/lib/api';

export function SetPinPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isLoading, refreshMe } = useAuth();
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isLoading && !user) return <Navigate to="/login" replace />;
  if (!isLoading && user && !user.mustChangePin) {
    return <Navigate to={user.role === 'OWNER' ? '/dashboard' : '/'} replace />;
  }

  const canSubmit =
    newPin.length === 6 &&
    confirmPin.length === 6 &&
    newPin === confirmPin &&
    /^\d{6}$/.test(newPin);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!canSubmit) return;
    setLoading(true);
    try {
      await api.post('/auth/set-pin', { newPin });
      await refreshMe();
      navigate(user?.role === 'OWNER' ? '/dashboard' : '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-6 py-8 max-w-md mx-auto w-full">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-primary">
            {t('auth.setPinTitle', 'Set a new PIN')}
          </h1>
          <p className="text-text-secondary mt-1">
            {t('auth.setPinSubtitle', 'For security, please create your own PIN to continue.')}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="newPin">
              {t('auth.newPin', 'New PIN')}
            </label>
            <div className="relative">
              <input
                id="newPin"
                type={show ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={6}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                className="input-field pr-14"
                placeholder="••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 min-h-touch min-w-touch flex items-center justify-center text-text-secondary"
                aria-label={show ? t('login.hidePin') : t('login.showPin')}
              >
                {show ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="confirmPin">
              {t('auth.confirmPin', 'Confirm PIN')}
            </label>
            <input
              id="confirmPin"
              type={show ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              className="input-field"
              placeholder="••••••"
              required
            />
          </div>

          {newPin.length === 6 && confirmPin.length === 6 && newPin !== confirmPin && (
            <p className="text-danger text-sm" role="alert">
              {t('auth.pinMismatch', 'PINs do not match')}
            </p>
          )}

          {error && (
            <p className="text-danger text-sm bg-danger/10 p-3 rounded-lg" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={!canSubmit || loading}>
            {loading ? t('common.loading') : t('common.continue', 'Continue')}
          </button>
        </form>
      </div>
    </div>
  );
}

