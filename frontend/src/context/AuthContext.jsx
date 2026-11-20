import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/index.js';
import { tokenStore } from '../api/client.js';

const AuthContext = createContext(null);

export const ROLES = { ADMIN: 'Admin', MANAGER: 'Inventory Manager', STAFF: 'Staff' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    if (!tokenStore.get()) return undefined;
    let cancelled = false;
    authApi
      .me()
      .then((r) => !cancelled && setUser(r.data))
      .catch(() => !cancelled && tokenStore.clear())
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.addEventListener('stockflow:unauthorized', logout);
    return () => window.removeEventListener('stockflow:unauthorized', logout);
  }, [logout]);

  const login = useCallback(async (credentials) => {
    const res = await authApi.login(credentials);
    tokenStore.set(res.data.token);
    setUser(res.data.user);
  }, []);

  const register = useCallback(async (payload) => {
    const res = await authApi.register(payload);
    tokenStore.set(res.data.token);
    setUser(res.data.user);
  }, []);

  const value = useMemo(() => {
    const role = user?.role;
    return {
      user,
      loading,
      login,
      register,
      logout,
      setUser,
      isAdmin: role === ROLES.ADMIN,
      isManager: role === ROLES.MANAGER,
      isStaff: role === ROLES.STAFF,
      /** Admin or Inventory Manager: may manage master data, purchases, transfers, adjustments. */
      canManage: role === ROLES.ADMIN || role === ROLES.MANAGER,
      hasRole: (...roles) => roles.includes(role),
    };
  }, [user, loading, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
