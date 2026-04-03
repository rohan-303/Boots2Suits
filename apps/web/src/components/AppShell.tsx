import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export function AppShell() {
  const { user, logoutUser } = useAuth();
  const showVeteran = user?.role === "veteran" || user?.role === "admin";
  const showEmployer = user?.role === "employer" || user?.role === "admin";
  const showAdmin = user?.role === "admin";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#f8fafc,_#e2e8f0_48%,_#cbd5e1)] text-slate-900">
      <header className="border-b border-slate-300/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/" className="text-xl font-bold tracking-tight text-slate-900">
            Boots2Suits
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="rounded-full bg-slate-900 px-3 py-1 font-medium text-white">
              {user?.role}
            </span>
            <span className="text-slate-600">{user?.email}</span>
            <button
              type="button"
              onClick={() => void logoutUser()}
              className="rounded-md border border-slate-400 px-3 py-1.5 font-medium hover:bg-slate-100"
            >
              Logout
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-5 pb-4 text-sm">
          {showVeteran ? (
            <>
              <Link className="font-medium text-slate-700 hover:text-blue-700" to="/app/veteran">
                Veteran Dashboard
              </Link>
              <Link className="font-medium text-slate-700 hover:text-blue-700" to="/app/veteran/profile">
                Veteran Profile
              </Link>
              <Link className="font-medium text-slate-700 hover:text-blue-700" to="/app/veteran/persona">
                Veteran Persona
              </Link>
              <Link className="font-medium text-slate-700 hover:text-blue-700" to="/app/veteran/recommendations">
                Recommended Jobs
              </Link>
              <Link className="font-medium text-slate-700 hover:text-blue-700" to="/app/veteran/applications">
                Applications
              </Link>
            </>
          ) : null}
          {showEmployer ? (
            <>
              <Link className="font-medium text-slate-700 hover:text-amber-700" to="/app/employer">
                Employer Dashboard
              </Link>
              <Link className="font-medium text-slate-700 hover:text-amber-700" to="/app/employer/profile">
                Employer Profile
              </Link>
              <Link className="font-medium text-slate-700 hover:text-amber-700" to="/app/employer/jobs">
                Employer Jobs
              </Link>
              <Link className="font-medium text-slate-700 hover:text-amber-700" to="/app/employer/connectors">
                ATS Connectors
              </Link>
            </>
          ) : null}
          {showAdmin ? (
            <Link className="font-medium text-slate-700 hover:text-slate-900" to="/app/admin">
              Admin Dashboard
            </Link>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-5">
        <Outlet />
      </main>
    </div>
  );
}
