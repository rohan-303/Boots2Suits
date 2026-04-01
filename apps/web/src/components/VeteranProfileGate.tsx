import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { getVeteranProfile } from "../lib/api";

export function VeteranProfileGate() {
  const { user } = useAuth();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (user?.role !== "veteran") {
        setLoading(false);
        return;
      }
      const result = await getVeteranProfile();
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
    return <div className="p-8 text-sm text-slate-600">Loading veteran profile...</div>;
  }

  if (user?.role !== "veteran") {
    return <Outlet />;
  }

  const isOnboardingRoute = location.pathname.startsWith("/app/veteran/onboarding");

  if (!complete && !isOnboardingRoute) {
    return <Navigate to="/app/veteran/onboarding" replace />;
  }

  if (complete && isOnboardingRoute) {
    return <Navigate to="/app/veteran" replace />;
  }

  return <Outlet />;
}

