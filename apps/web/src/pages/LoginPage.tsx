import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PRODUCT } from '@/config/product';
import { useAuth } from '@/contexts/AuthContext';
import { ConnectivityIndicator } from '@/hooks/useOnline';
import { ApiError } from '@/lib/api';
import { Eye, EyeOff } from 'lucide-react';

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const { user, isLoading, login } = useAuth();
  const [phone, setPhone] = useState(import.meta.env.DEV ? '9985533376' : '');
  const [pin, setPin] = useState(import.meta.env.DEV ? '123456' : '');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isLoading && user) {
    if (user.mustChangePin) return <Navigate to="/set-pin" replace />;
    return <Navigate to={user.role === 'OWNER' ? '/dashboard' : '/'} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(phone, pin);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <div className="flex-1 flex flex-col justify-center px-6 py-8 max-w-md mx-auto w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-3xl font-bold">V</span>
          </div>
          <h1 className="text-2xl font-bold text-primary">{PRODUCT.name}</h1>
          <p className="text-text-secondary mt-1">{t('app.tagline')}</p>
        </div>

        <div className="flex justify-between items-center mb-6">
          <ConnectivityIndicator />
          <select
            value={i18n.language}
            onChange={(e) => {
              i18n.changeLanguage(e.target.value);
              localStorage.setItem('language', e.target.value);
            }}
            className="text-sm border border-border rounded-lg px-3 py-2 bg-surface"
            aria-label="Language"
          >
            <option value="en">English</option>
            <option value="te">తెలుగు</option>
          </select>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="phone">{t('login.phone')}</label>
            <input
              id="phone"
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
            <label className="label" htmlFor="pin">{t('login.pin')}</label>
            <div className="relative">
              <input
                id="pin"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="input-field pr-14"
                placeholder="••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 min-h-touch min-w-touch flex items-center justify-center text-text-secondary"
                aria-label={showPin ? t('login.hidePin') : t('login.showPin')}
              >
                {showPin ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-danger text-sm bg-danger/10 p-3 rounded-lg" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? t('common.loading') : t('login.submit')}
          </button>
        </form>

        <p className="text-center mt-4 text-sm text-text-secondary">
          <Link to="/reset-pin" className="text-primary underline">
            {t('login.forgotPin', 'Forgot PIN?')}
          </Link>
        </p>

        <p className="text-center mt-2 text-sm text-text-secondary">
          Owner? <Link to="/signup" className="text-primary underline">Create account</Link>
        </p>
      </div>
    </div>
  );
}
