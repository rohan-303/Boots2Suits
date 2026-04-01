import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { getEmployerProfile } from "../lib/api";

export function EmployerProfileGate() {
  const { user } = useAuth();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (user?.role !== "employer") {
        setLoading(false);
        return;
      }
      const result = await getEmployerProfile();
      if (!mounted) return;
      setComplete(Boolean(result.ok && result.data?.complete));
      setLoading(false);
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [user?.role]);

  if (loading) {
    return <div className="p-8 text-sm text-slate-600">Loading employer profile...</div>;
  }

  if (user?.role !== "employer") {
    return <Outlet />;
  }

  const isOnboardingRoute = location.pathname.startsWith("/app/employer/onboarding");

  if (!complete && !isOnboardingRoute) {
    return <Navigate to="/app/employer/onboarding" replace />;
  }

  if (complete && isOnboardingRoute) {
    return <Navigate to="/app/employer" replace />;
  }

  return <Outlet />;
}
