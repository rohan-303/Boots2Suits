import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { generateEmployerJobPersona, getEmployerJob } from "../lib/api";
import type { JobPersona } from "../types/employer";

export function EmployerJobPersonaPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [jobTitle, setJobTitle] = useState<string>("");
  const [persona, setPersona] = useState<JobPersona | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!jobId) return;
    setLoading(true);
    const result = await getEmployerJob(jobId);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to load job persona.");
      setLoading(false);
      return;
    }
    setJobTitle(result.data.job.title);
    setPersona(result.data.persona);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [jobId]);

  async function onGenerate() {
    if (!jobId) return;
    setGenerating(true);
    setError(null);
    const result = await generateEmployerJobPersona(jobId);
    setGenerating(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to generate persona.");
      return;
    }
    setPersona(result.data.persona);
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading job persona...</div>;
  }

  return (
    <section className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Job Persona: {jobTitle || "Job"}</h1>
        <button
          type="button"
          onClick={() => void onGenerate()}
          disabled={generating}
          className="rounded bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {generating ? "Generating..." : "Generate Job Persona"}
        </button>
      </div>

      {!persona ? (
        <p className="mt-4 text-sm text-slate-600">No persona generated yet.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-sm font-semibold">Summary</p>
            <p className="text-sm text-slate-700">{persona.summary}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold">Leadership Level</p>
              <p className="text-sm text-slate-700">{persona.leadershipLevel ?? "-"}</p>
            </div>
            <div>
              <p className="text-sm font-semibold">Execution vs Strategy</p>
              <p className="text-sm text-slate-700">{persona.executionVsStrategy ?? "-"}</p>
            </div>
            <div>
              <p className="text-sm font-semibold">Environment Type</p>
              <p className="text-sm text-slate-700">{persona.environmentType ?? "-"}</p>
            </div>
            <div>
              <p className="text-sm font-semibold">Technical Depth</p>
              <p className="text-sm text-slate-700">{persona.technicalDepth ?? "-"}</p>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold">Suggested Candidate Archetypes</p>
            <p className="text-sm text-slate-700">
              {persona.suggestedCandidateArchetypes.join(", ") || "-"}
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold">Priority Signals</p>
            <p className="text-sm text-slate-700">{persona.prioritySignals.join(", ") || "-"}</p>
          </div>
          <div>
            <p className="text-sm font-semibold">Disqualifiers</p>
            <p className="text-sm text-slate-700">{persona.disqualifiers.join(", ") || "-"}</p>
          </div>
          <div>
            <p className="text-sm font-semibold">Suggested Role Family</p>
            <p className="text-sm text-slate-700">{persona.suggestedRoleFamily ?? "-"}</p>
          </div>
          <p className="text-xs text-slate-500">
            Model: {persona.modelVersion ?? "unknown"} - Snapshot hash:{" "}
            {(persona.sourceSnapshotHash ?? "").slice(0, 16) || "n/a"}...
          </p>
        </div>
      )}

      {error ? <p className="mt-4 text-sm font-medium text-rose-700">{error}</p> : null}
    </section>
  );
}
