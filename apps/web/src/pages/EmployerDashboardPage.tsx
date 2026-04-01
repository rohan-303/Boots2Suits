import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getEmployerJobs } from "../lib/api";

export function EmployerDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [jobCount, setJobCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const result = await getEmployerJobs();
      if (!mounted) return;
      if (!result.ok || !result.data) {
        setError(result.error ?? "Unable to load employer jobs.");
        setLoading(false);
        return;
      }
      setJobCount(result.data.jobs.length);
      setLoading(false);
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="rounded-2xl border border-slate-300/70 bg-white/80 p-6 shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
        Employer Workspace
      </p>
      <h1 className="mt-2 text-2xl font-bold">Employer Dashboard</h1>
      <p className="mt-3 text-sm text-slate-600">
        Manage your company profile, create structured jobs, and generate deterministic job personas.
      </p>
      {loading ? <p className="mt-4 text-sm text-slate-500">Loading jobs...</p> : null}
      {!loading && jobCount === 0 ? (
        <p className="mt-4 text-sm text-amber-800">
          You do not have jobs yet.{" "}
          <Link className="font-semibold underline" to="/app/employer/jobs">
            Create your first job posting
          </Link>
          .
        </p>
      ) : null}
      {!loading && jobCount > 0 ? (
        <p className="mt-4 text-sm text-slate-700">
          You currently have {jobCount} job posting{jobCount === 1 ? "" : "s"}.
        </p>
      ) : null}
      <div className="mt-5 flex gap-4 text-sm">
        <Link className="font-semibold text-amber-700 underline" to="/app/employer/profile">
          View Employer Profile
        </Link>
        <Link className="font-semibold text-amber-700 underline" to="/app/employer/jobs">
          Manage Jobs
        </Link>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Open a job and run matching to generate ranked candidates with explanations.
      </p>
      {error ? <p className="mt-4 text-sm font-medium text-rose-700">{error}</p> : null}
    </section>
  );
}
