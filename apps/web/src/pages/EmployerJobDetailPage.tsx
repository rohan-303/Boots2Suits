import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { generateEmployerJobPersona, getEmployerJob, runJobMatching } from "../lib/api";
import type { EmployerJobDetail, JobPersona } from "../types/employer";

export function EmployerJobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<EmployerJobDetail | null>(null);
  const [persona, setPersona] = useState<JobPersona | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [runningMatch, setRunningMatch] = useState(false);
  const [matchRunMessage, setMatchRunMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!jobId) return;
    setLoading(true);
    const result = await getEmployerJob(jobId);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to load job.");
      setLoading(false);
      return;
    }
    setJob(result.data.job);
    setPersona(result.data.persona);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [jobId]);

  async function onGeneratePersona() {
    if (!jobId) return;
    setGenerating(true);
    setError(null);
    const result = await generateEmployerJobPersona(jobId);
    setGenerating(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to generate job persona.");
      return;
    }
    setPersona(result.data.persona);
  }

  async function onRunMatching() {
    if (!jobId) return;
    setRunningMatch(true);
    setError(null);
    setMatchRunMessage(null);
    const result = await runJobMatching(jobId);
    setRunningMatch(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to run matching.");
      return;
    }
    setMatchRunMessage(
      `Matching completed for ${result.data.totalCandidatesScored} candidates.`
    );
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading job details...</div>;
  }

  if (!job) {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        Job not found.{" "}
        <Link className="underline" to="/app/employer/jobs">
          Go back to jobs
        </Link>
        .
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{job.title}</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void onGeneratePersona()}
              disabled={generating}
              className="rounded bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {generating ? "Generating..." : "Generate Job Persona"}
            </button>
            <button
              type="button"
              onClick={() => void onRunMatching()}
              disabled={runningMatch}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {runningMatch ? "Running..." : "Run Matching"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {job.department ?? "General"} - {job.locationType} - {job.employmentType} - {job.status}
        </p>
        <p className="mt-4 text-sm text-slate-700">{job.description}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <p className="text-sm">
            <strong>Must-have skills:</strong> {job.mustHaveSkills.join(", ") || "-"}
          </p>
          <p className="text-sm">
            <strong>Nice-to-have skills:</strong> {job.niceToHaveSkills.join(", ") || "-"}
          </p>
          <p className="text-sm">
            <strong>Experience level:</strong> {job.requiredExperienceLevel ?? "-"}
          </p>
          <p className="text-sm">
            <strong>Clearance:</strong> {job.clearanceRequirement ?? "-"}
          </p>
          <p className="text-sm">
            <strong>Travel:</strong> {job.travelRequirement ?? "-"}
          </p>
          <p className="text-sm">
            <strong>Compensation:</strong>{" "}
            {job.compensationMin && job.compensationMax
              ? `${job.currency ?? "USD"} ${job.compensationMin} - ${job.compensationMax}`
              : "-"}
          </p>
        </div>
        <div className="mt-5 text-sm">
          <Link className="font-semibold text-amber-700 underline" to={`/app/employer/jobs/${job.id}/persona`}>
            View full job persona
          </Link>
          <span className="mx-2 text-slate-400">|</span>
          <Link className="font-semibold text-amber-700 underline" to={`/app/employer/jobs/${job.id}/matches`}>
            View match results
          </Link>
        </div>
        {matchRunMessage ? <p className="mt-4 text-sm font-medium text-emerald-700">{matchRunMessage}</p> : null}
        {error ? <p className="mt-4 text-sm font-medium text-rose-700">{error}</p> : null}
      </div>

      <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
        <h2 className="text-xl font-semibold">Persona Status</h2>
        {persona ? (
          <p className="mt-2 text-sm text-slate-700">{persona.summary}</p>
        ) : (
          <p className="mt-2 text-sm text-slate-600">No persona generated yet for this job.</p>
        )}
      </div>
    </section>
  );
}
