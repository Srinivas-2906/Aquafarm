import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { AuthUser } from '@aqualedger/contracts';
import { authApi } from '@/lib/api';
import { db } from '@/lib/db';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  selectedFarmId: string | null;
  setSelectedFarmId: (id: string) => void;
  login: (phone: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(
    localStorage.getItem('selectedFarmId'),
  );

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      authApi
        .me()
        .then((u) => {
          setUser(u);
          db.userProfile.put(u);
          if (!selectedFarmId && u.farms.length > 0) {
            setSelectedFarmId(u.farms[0].farmId);
          }
        })
        .catch(async () => {
          const cached = await db.userProfile.toCollection().first();
          if (cached) setUser(cached);
          localStorage.removeItem('accessToken');
        })
        .finally(() => setIsLoading(false));
    } else {
      db.userProfile
        .toCollection()
        .first()
        .then((cached) => {
          if (cached && !navigator.onLine) setUser(cached);
        })
        .finally(() => setIsLoading(false));
    }
  }, []);

  const login = useCallback(async (phone: string, pin: string) => {
    const result = await authApi.login(phone, pin);
    localStorage.setItem('accessToken', result.accessToken);
    setUser(result.user);
    await db.userProfile.put(result.user);
    if (result.user.farms.length > 0) {
      const farmId = result.user.farms[0].farmId;
      setSelectedFarmId(farmId);
      localStorage.setItem('selectedFarmId', farmId);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* ignore */
    }
    localStorage.removeItem('accessToken');
    setUser(null);
  }, []);

  const handleSetFarm = useCallback((id: string) => {
    setSelectedFarmId(id);
    localStorage.setItem('selectedFarmId', id);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        selectedFarmId,
        setSelectedFarmId: handleSetFarm,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
