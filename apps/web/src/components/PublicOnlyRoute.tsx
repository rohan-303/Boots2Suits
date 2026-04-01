import { Navigate, Outlet } from "react-router-dom";
import { roleHomePath, useAuth } from "../auth/AuthProvider";

export function PublicOnlyRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="p-8 text-sm text-slate-600">Loading session...</div>;
  }

  if (user) {
    return <Navigate to={roleHomePath(user.role)} replace />;
  }

  return <Outlet />;
}

