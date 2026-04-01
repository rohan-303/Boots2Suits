import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getEmployerProfile } from "../lib/api";
import type { EmployerProfile } from "../types/employer";

export function EmployerProfilePage() {
  const [profile, setProfile] = useState<EmployerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const result = await getEmployerProfile();
      if (!mounted) return;
      if (!result.ok || !result.data) {
        setError(result.error ?? "Unable to load employer profile.");
        setLoading(false);
        return;
      }
      setProfile(result.data.profile);
      setLoading(false);
    }

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading employer profile...</div>;
  }

  if (!profile) {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        Employer profile not found.{" "}
        <Link to="/app/employer/onboarding" className="underline">
          Start onboarding
        </Link>
        .
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
        <h1 className="text-2xl font-bold">Employer Profile</h1>
        <p className="mt-3 text-sm text-slate-700">
          {profile.name} - {profile.industry ?? "-"} - {profile.headquarters ?? "-"}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <p className="text-sm">
            <strong>Company Size:</strong> {profile.size ?? "-"}
          </p>
          <p className="text-sm">
            <strong>Website:</strong> {profile.websiteUrl ?? "-"}
          </p>
          <p className="text-sm">
            <strong>Hiring Volume:</strong> {profile.hiringVolume ?? "-"}
          </p>
          <p className="text-sm">
            <strong>Veteran Priority:</strong> {profile.veteranHiringPriority ? "Yes" : "No"}
          </p>
          <p className="text-sm">
            <strong>Clearance Roles:</strong> {profile.clearanceSensitiveRoles ? "Yes" : "No"}
          </p>
          <p className="text-sm">
            <strong>Recruiter:</strong> {profile.recruiterName ?? "-"} ({profile.recruiterTitle ?? "-"})
          </p>
        </div>
        <div className="mt-4">
          <p className="text-sm font-semibold">Hiring Roles</p>
          <p className="text-sm text-slate-700">{profile.hiringRoles.join(", ") || "-"}</p>
        </div>
        <div className="mt-2">
          <p className="text-sm font-semibold">Hiring Regions</p>
          <p className="text-sm text-slate-700">{profile.hiringRegions.join(", ") || "-"}</p>
        </div>
        <div className="mt-5 text-sm">
          <Link className="font-semibold text-amber-700 underline" to="/app/employer/jobs">
            Manage jobs
          </Link>
        </div>
      </div>

      {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
    </section>
  );
}
