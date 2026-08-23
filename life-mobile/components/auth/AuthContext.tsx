'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User { name: string; email: string; }
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, name: string) => void;
  logout: () => void;
  isFirstTime: boolean;
  setFirstTimeDone: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null, isLoading: true,
  login: () => {}, logout: () => {},
  isFirstTime: false, setFirstTimeDone: () => {}
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstTime, setIsFirstTime] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('camera505_user');
    let firstTime: string | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getNamespacedItem } = require('@/lib/userStorage');
      firstTime = getNamespacedItem('camera505_first_time');
    } catch { firstTime = localStorage.getItem('camera505_first_time'); }
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch {}
    }
    setIsFirstTime(firstTime === 'true');
    setIsLoading(false);
  }, []);

  const login = (email: string, name: string) => {
    const u = { email, name };
    localStorage.setItem('camera505_user', JSON.stringify(u));
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem('camera505_user');
    // Keep per-user history/profile — do not delete namespaced data
    setUser(null);
  };

  const setFirstTimeDone = () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { setNamespacedItem } = require('@/lib/userStorage');
      setNamespacedItem('camera505_first_time', 'false');
    } catch { localStorage.setItem('camera505_first_time', 'false'); }
    setIsFirstTime(false);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, isFirstTime, setFirstTimeDone }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export default AuthContext;
