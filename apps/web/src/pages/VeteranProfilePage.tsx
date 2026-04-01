import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  generateVeteranPersona,
  getVeteranProfile,
  uploadVeteranResume
} from "../lib/api";
import type { VeteranPersona, VeteranProfile, VeteranResume } from "../types/veteran";

export function VeteranProfilePage() {
  const [profile, setProfile] = useState<VeteranProfile | null>(null);
  const [persona, setPersona] = useState<VeteranPersona | null>(null);
  const [resume, setResume] = useState<VeteranResume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await getVeteranProfile();
    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to load profile.");
      setLoading(false);
      return;
    }
    setProfile(result.data.profile);
    setPersona(result.data.persona);
    setResume(result.data.resume);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onGeneratePersona() {
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

  async function onUploadResume(file: File) {
    setUploading(true);
    setError(null);
    const result = await uploadVeteranResume(file);
    setUploading(false);
    if (!result.ok) {
      setError(result.error ?? "Unable to upload resume.");
      return;
    }
    await load();
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading veteran profile...</div>;
  }

  if (!profile) {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        Profile not found. <Link to="/app/veteran/onboarding" className="underline">Start onboarding</Link>.
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Veteran Profile</h1>
          <button
            type="button"
            onClick={() => void onGeneratePersona()}
            disabled={generating}
            className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {generating ? "Generating..." : "Generate Persona"}
          </button>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          {profile.mosTitle} ({profile.mosCode}) • {profile.militaryBranch} • {profile.locationCity},{" "}
          {profile.locationState}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <p className="text-sm"><strong>Rank:</strong> {profile.highestRank ?? "-"}</p>
          <p className="text-sm"><strong>Clearance:</strong> {profile.clearanceLevel ?? "-"}</p>
          <p className="text-sm"><strong>Work Authorization:</strong> {profile.workAuthorization ?? "-"}</p>
          <p className="text-sm"><strong>Relocation:</strong> {profile.relocationPreference ?? "-"}</p>
        </div>
        <p className="mt-4 text-sm text-slate-700">{profile.responsibilitiesSummary}</p>
        <div className="mt-4">
          <p className="text-sm font-semibold">Key Skills</p>
          <p className="text-sm text-slate-700">{(profile.keySkills ?? []).join(", ") || "-"}</p>
        </div>
        <div className="mt-2">
          <p className="text-sm font-semibold">Desired Roles</p>
          <p className="text-sm text-slate-700">{(profile.desiredRoles ?? []).join(", ") || "-"}</p>
        </div>
        <div className="mt-5 rounded border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold">Resume Upload & Parsing</p>
          <p className="mt-1 text-xs text-slate-600">
            Upload a PDF to enrich your skills/profile signals without overwriting your manual entries.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="rounded border border-slate-400 bg-white px-3 py-2 text-sm font-medium cursor-pointer">
              {uploading ? "Uploading..." : "Upload / Replace Resume (PDF)"}
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void onUploadResume(file);
                  }
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {resume ? (
              <p className="text-xs text-slate-600">
                {resume.originalFilename} - status: {resume.parseStatus}
                {resume.parseConfidence ? ` - confidence: ${resume.parseConfidence}` : ""}
              </p>
            ) : (
              <p className="text-xs text-slate-500">No resume uploaded yet.</p>
            )}
          </div>
          {resume?.parsedData ? (
            <div className="mt-3 text-xs text-slate-700">
              <p>
                Sections parsed:{" "}
                {[
                  resume.parsedData.summary ? "summary" : "",
                  (resume.parsedData.experience?.length ?? 0) > 0 ? "experience" : "",
                  (resume.parsedData.education?.length ?? 0) > 0 ? "education" : "",
                  (resume.parsedData.certifications?.length ?? 0) > 0 ? "certifications" : "",
                  (resume.parsedData.skills?.length ?? 0) > 0 ? "skills" : ""
                ]
                  .filter(Boolean)
                  .join(", ") || "none"}
              </p>
              <p className="mt-1">
                Parsed skills preview: {(resume.parsedData.skills ?? []).slice(0, 8).join(", ") || "-"}
              </p>
            </div>
          ) : null}
          {resume?.parseError ? (
            <p className="mt-2 text-xs font-medium text-rose-700">{resume.parseError}</p>
          ) : null}
        </div>
        {error ? <p className="mt-4 text-sm font-medium text-rose-700">{error}</p> : null}
      </div>

      <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
        <h2 className="text-xl font-bold">Persona Status</h2>
        {persona ? (
          <>
            <p className="mt-2 text-sm text-slate-700">{persona.summary}</p>
            <Link className="mt-3 inline-block text-sm font-semibold text-blue-700 underline" to="/app/veteran/persona">
              View full persona
            </Link>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-600">No persona generated yet.</p>
        )}
      </div>
    </section>
  );
}
