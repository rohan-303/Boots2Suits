import { Navigate, Outlet, useLocation } from "react-router-dom";
import { roleHomePath, useAuth } from "../auth/AuthProvider";
import type { UserRole } from "../auth/types";

export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="p-8 text-sm text-slate-600">Loading session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={roleHomePath(user.role)} replace />;
  }

  return <Outlet />;
}

