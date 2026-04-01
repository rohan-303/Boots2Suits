import { useEffect, useState } from "react";
import { generateVeteranPersona, getVeteranProfile } from "../lib/api";
import type { VeteranPersona } from "../types/veteran";

export function VeteranPersonaPage() {
  const [persona, setPersona] = useState<VeteranPersona | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  async function load() {
    setLoading(true);
    const result = await getVeteranProfile();
    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to load persona.");
      setLoading(false);
      return;
    }
    setPersona(result.data.persona);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onGenerate() {
    setGenerating(true);
    setError(null);
    const result = await generateVeteranPersona();
    setGenerating(false);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to generate persona.");
      return;
    }
    setPersona(result.data.persona);
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading persona...</div>;
  }

  return (
    <section className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Overall Veteran Persona</h1>
        <button
          type="button"
          onClick={() => void onGenerate()}
          disabled={generating}
          className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {generating ? "Generating..." : "Generate Persona"}
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
          <div>
            <p className="text-sm font-semibold">Strengths</p>
            <p className="text-sm text-slate-700">{(persona.strengths ?? []).join(", ") || "-"}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold">Experience Level</p>
              <p className="text-sm text-slate-700">{persona.experienceLevel ?? "-"}</p>
            </div>
            <div>
              <p className="text-sm font-semibold">Role Clusters</p>
              <p className="text-sm text-slate-700">{(persona.roleClusters ?? []).join(", ") || "-"}</p>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold">Leadership Profile</p>
            <p className="text-sm text-slate-700">{persona.leadershipProfile ?? "-"}</p>
          </div>
          <div>
            <p className="text-sm font-semibold">Technical Profile</p>
            <p className="text-sm text-slate-700">{persona.technicalProfile ?? "-"}</p>
          </div>
          <div>
            <p className="text-sm font-semibold">Suggested Job Titles</p>
            <p className="text-sm text-slate-700">{(persona.suggestedJobTitles ?? []).join(", ") || "-"}</p>
          </div>
          <p className="text-xs text-slate-500">
            Model: {persona.modelVersion ?? "unknown"} • Snapshot hash:{" "}
            {(persona.sourceSnapshotHash ?? "").slice(0, 16) || "n/a"}...
          </p>
        </div>
      )}

      {error ? <p className="mt-4 text-sm font-medium text-rose-700">{error}</p> : null}
    </section>
  );
}

