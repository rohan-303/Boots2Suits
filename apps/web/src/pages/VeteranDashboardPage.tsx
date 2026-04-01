import { Link } from "react-router-dom";

export function VeteranDashboardPage() {
  return (
    <section className="rounded-2xl border border-slate-300/70 bg-white/80 p-6 shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
        Veteran Workspace
      </p>
      <h1 className="mt-2 text-2xl font-bold">Veteran Dashboard</h1>
      <p className="mt-3 text-sm text-slate-600">
        Placeholder dashboard for veteran flows.
      </p>
      <div className="mt-4 flex gap-3 text-sm">
        <Link className="font-semibold text-blue-700 underline" to="/app/veteran/profile">
          View Profile
        </Link>
        <Link className="font-semibold text-blue-700 underline" to="/app/veteran/persona">
          View Persona
        </Link>
        <Link className="font-semibold text-blue-700 underline" to="/app/veteran/recommendations">
          Recommended Jobs
        </Link>
        <Link className="font-semibold text-blue-700 underline" to="/app/veteran/applications">
          My Applications
        </Link>
      </div>
    </section>
  );
}
