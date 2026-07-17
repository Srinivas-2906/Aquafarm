import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { PRODUCT } from '@/config/product';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError } from '@/lib/api';

export function OwnerSignupPage() {
  const { user, isLoading, signupOwner } = useAuth();
  const [organizationName, setOrganizationName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [signupCode, setSignupCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isLoading && user) {
    return <Navigate to={user.role === 'OWNER' ? '/dashboard' : '/'} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signupOwner({
        organizationName,
        ownerName,
        phoneNumber: phone,
        pin,
        signupCode,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Signup failed');
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
          <p className="text-text-secondary mt-1">Owner signup</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="orgName">Organization name</label>
            <input
              id="orgName"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              className="input-field"
              placeholder="Sandhya Aqua Farms"
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="ownerName">Owner name</label>
            <input
              id="ownerName"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="input-field"
              placeholder="Owner Name"
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="phone">Phone</label>
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
            <label className="label" htmlFor="pin">PIN</label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="input-field"
              placeholder="••••••"
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="signupCode">Signup code</label>
            <input
              id="signupCode"
              value={signupCode}
              onChange={(e) => setSignupCode(e.target.value)}
              className="input-field"
              placeholder="(provided by admin)"
              required
            />
          </div>

          {error && (
            <p className="text-danger text-sm bg-danger/10 p-3 rounded-lg" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating account...' : 'Create owner account'}
          </button>
        </form>

        <p className="text-center mt-4 text-sm text-text-secondary">
          Already have an account? <Link to="/login" className="text-primary underline">Login</Link>
        </p>
      </div>
    </div>
  );
}

