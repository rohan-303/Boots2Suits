import { useEffect, useState } from "react";
import { getMyApplications } from "../lib/api";
import type { VeteranApplication } from "../types/application";

export function VeteranApplicationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applications, setApplications] = useState<VeteranApplication[]>([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const result = await getMyApplications();
      if (!mounted) return;
      if (!result.ok || !result.data) {
        setError(result.error ?? "Unable to load applications.");
        setLoading(false);
        return;
      }
      setApplications(result.data.applications);
      setLoading(false);
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading applications...</div>;
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
        <h1 className="text-2xl font-bold">My Applications</h1>
        <p className="mt-2 text-sm text-slate-600">
          Track your submitted applications and status transitions.
        </p>
        {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
      </div>

      <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
        {applications.length === 0 ? (
          <p className="text-sm text-slate-600">
            No applications yet. Open Recommended Jobs to apply.
          </p>
        ) : (
          <ul className="space-y-3">
            {applications.map((application) => (
              <li key={application.id} className="rounded border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{application.job.title}</p>
                    <p className="text-sm text-slate-600">
                      {application.job.companyName} - {application.job.locationType}
                      {application.job.locationCity || application.job.locationState
                        ? ` - ${application.job.locationCity ?? ""} ${application.job.locationState ?? ""}`.trim()
                        : ""}
                    </p>
                  </div>
                  <div className="rounded bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-800">
                    {application.status}
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Applied: {new Date(application.appliedAt).toLocaleString()}
                </p>
                <div className="mt-3">
                  <p className="text-sm font-semibold">Recent status history</p>
                  {application.events.length === 0 ? (
                    <p className="text-sm text-slate-600">No events available.</p>
                  ) : (
                    <ul className="mt-1 space-y-1 text-sm text-slate-700">
                      {application.events.slice(0, 5).map((event, idx) => (
                        <li key={`${application.id}-${idx}`}>
                          {new Date(event.occurredAt).toLocaleString()} - {event.eventType}
                          {event.toStatus ? ` -> ${event.toStatus}` : ""}
                          {event.reasonCode ? ` (${event.reasonCode})` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
