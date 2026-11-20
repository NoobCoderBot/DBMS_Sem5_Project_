import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { LoadingBlock } from './ui/index.jsx';

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen"><LoadingBlock label="Loading your workspace..." /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

export function GuestOnly() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen"><LoadingBlock /></div>;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Frontend convenience only: the API enforces the same roles independently. */
export function RequireRole({ roles }) {
  const { hasRole } = useAuth();
  if (!hasRole(...roles)) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <ShieldAlert className="mb-3 h-9 w-9 text-zinc-300" />
        <h1 className="text-lg font-semibold">Access restricted</h1>
        <p className="mt-1 text-zinc-500">Your role does not have permission to view this page.</p>
      </div>
    );
  }
  return <Outlet />;
}
