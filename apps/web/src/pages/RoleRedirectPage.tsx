import { Navigate } from "react-router-dom";
import { roleHomePath, useAuth } from "../auth/AuthProvider";

export function RoleRedirectPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="p-8 text-sm text-slate-600">Loading session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={roleHomePath(user.role)} replace />;
}

