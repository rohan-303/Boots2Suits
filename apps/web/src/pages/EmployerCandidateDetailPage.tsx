import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  createEmployerJobExport,
  employerRejectCandidate,
  employerResetCandidateAction,
  employerReviewCandidate,
  employerShortlistCandidate,
  getEmployerCandidateDetail
} from "../lib/api";
import type { EmployerCandidateDetail } from "../types/matching";

function formatScore(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

export function EmployerCandidateDetailPage() {
  const { jobId, veteranProfileId } = useParams<{ jobId: string; veteranProfileId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [detail, setDetail] = useState<EmployerCandidateDetail | null>(null);

  async function load() {
    if (!jobId || !veteranProfileId) return;
    setLoading(true);
    const result = await getEmployerCandidateDetail(jobId, veteranProfileId);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to load candidate detail.");
      setLoading(false);
      return;
    }

    setDetail({
      candidate: result.data.candidate,
      jobContext: result.data.jobContext,
      match: result.data.match,
      evidence: result.data.evidence,
      application: result.data.application
    });
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [jobId, veteranProfileId]);

  async function handleAction(action: "review" | "shortlist" | "reject" | "reset") {
    if (!jobId || !veteranProfileId) return;
    setActing(true);
    const result =
      action === "review"
        ? await employerReviewCandidate(jobId, veteranProfileId)
        : action === "shortlist"
        ? await employerShortlistCandidate(jobId, veteranProfileId)
        : action === "reject"
        ? await employerRejectCandidate(jobId, veteranProfileId)
        : await employerResetCandidateAction(jobId, veteranProfileId);
    setActing(false);
    if (!result.ok) {
      setError(result.error ?? "Unable to update candidate action.");
      return;
    }
    await load();
  }

  async function handleExportCandidate() {
    if (!jobId || !veteranProfileId) return;
    setActing(true);
    const result = await createEmployerJobExport(jobId, {
      candidateProfileIds: [veteranProfileId],
      exportTarget: "manual_handoff",
      exportFormat: "json"
    });
    setActing(false);
    if (!result.ok) {
      setError(result.error ?? "Unable to export candidate handoff packet.");
      return;
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading candidate detail...</div>;
  }

  if (!detail) {
    return <div className="p-6 text-sm text-rose-700">{error ?? "Candidate detail unavailable."}</div>;
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{detail.candidate.fullName ?? "Veteran Candidate"}</h1>
            <p className="mt-1 text-sm text-slate-700">{detail.candidate.headline}</p>
            <p className="mt-2 text-xs text-slate-500">
              Reviewing for: {detail.jobContext.title}
              {detail.jobContext.department ? ` (${detail.jobContext.department})` : ""}
            </p>
          </div>
          <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm">
            <p>
              <strong>Match:</strong> {formatScore(detail.match?.score ?? null)}
            </p>
            <p>
              <strong>Semantic:</strong> {formatScore(detail.match?.semanticScore ?? null)}
            </p>
            <p>
              <strong>Rule:</strong> {formatScore(detail.match?.ruleScore ?? null)}
            </p>
            <p>
              <strong>Rank:</strong> {detail.match?.rank ?? "-"}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link className="font-semibold text-amber-700 underline" to={`/app/employer/jobs/${jobId}/matches`}>
            Back to Ranked Results
          </Link>
          <p className="text-slate-500">Application state: {detail.application?.status ?? "none"}</p>
        </div>
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-5 shadow-lg">
          <h2 className="text-lg font-semibold">Decision Evidence</h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
            {(detail.match?.explanationBullets ?? []).map((bullet, index) => (
              <li key={index}>{bullet}</li>
            ))}
          </ul>
          <div className="mt-4 space-y-2 text-sm">
            <p>
              <strong>Leadership fit:</strong> {detail.evidence.fitSummaries.leadership}
            </p>
            <p>
              <strong>Clearance fit:</strong> {detail.evidence.fitSummaries.clearance}
            </p>
            <p>
              <strong>Location fit:</strong> {detail.evidence.fitSummaries.location}
            </p>
            <p>
              <strong>Compensation fit:</strong> {detail.evidence.fitSummaries.compensation}
            </p>
          </div>
          <div className="mt-4 grid gap-2">
            {(detail.match?.topFeatures ?? []).slice(0, 6).map((feature) => (
              <div key={feature.featureName} className="rounded border border-slate-200 p-2 text-sm">
                <p className="font-medium">{feature.featureName}</p>
                <p className="text-slate-600">
                  impact: {feature.featureImpact?.toFixed(3) ?? "-"} | reason: {feature.reasonCode ?? "-"}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-5 shadow-lg">
          <h2 className="text-lg font-semibold">Strengths and Gaps</h2>
          <p className="mt-2 text-sm font-semibold text-emerald-700">Key strengths</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
            {detail.evidence.strengths.length > 0 ? (
              detail.evidence.strengths.map((item, index) => <li key={index}>{item}</li>)
            ) : (
              <li>No major strengths flagged yet.</li>
            )}
          </ul>

          <p className="mt-4 text-sm font-semibold text-rose-700">Likely gaps</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
            {detail.evidence.likelyGaps.length > 0 ? (
              detail.evidence.likelyGaps.map((item, index) => <li key={index}>{item}</li>)
            ) : (
              <li>No major gaps identified from current evidence.</li>
            )}
          </ul>

          <div className="mt-4 rounded border border-slate-200 p-3 text-sm">
            <p className="font-semibold">Skill overlap</p>
            <p className="mt-1 text-slate-700">
              Must-have matched: {detail.evidence.skillOverlap.matchedMustHave.slice(0, 5).join(", ") || "-"}
            </p>
            <p className="text-slate-700">
              Preferred missing: {detail.evidence.skillOverlap.missingNiceToHave.slice(0, 5).join(", ") || "-"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-5 shadow-lg">
          <h2 className="text-lg font-semibold">Military-to-Civilian Snapshot</h2>
          <p className="mt-2 text-sm text-slate-700">
            {detail.candidate.militaryTranslation.branch ?? "-"} |{" "}
            {detail.candidate.militaryTranslation.mosCode ?? "-"}{" "}
            {detail.candidate.militaryTranslation.mosTitle ?? ""}
          </p>
          <p className="text-sm text-slate-700">
            Rank: {detail.candidate.militaryTranslation.highestRank ?? "-"} | Years:{" "}
            {detail.candidate.militaryTranslation.yearsOfService ?? "-"}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Translation v{detail.candidate.militaryTranslation.translationVersion ?? "-"} | confidence{" "}
            {detail.candidate.militaryTranslation.translationConfidence ?? "-"}
          </p>

          <div className="mt-3 space-y-2">
            {detail.candidate.militaryTranslation.occupationHistory.slice(0, 4).map((row, index) => (
              <div key={`${row.mosCode}-${index}`} className="rounded border border-slate-200 p-2 text-sm">
                <p className="font-medium">
                  {row.mosCode} - {row.mosTitle}
                </p>
                <p className="text-slate-600">Civilian equivalent: {row.civilianEquivalentTitle ?? "-"}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-5 shadow-lg">
          <h2 className="text-lg font-semibold">Persona and Resume Signals</h2>
          <p className="mt-2 text-sm text-slate-700">{detail.candidate.persona.summary ?? "-"}</p>
          <p className="mt-2 text-sm text-slate-700">
            Role clusters: {detail.candidate.persona.roleClusters.slice(0, 5).join(", ") || "-"}
          </p>
          <p className="text-sm text-slate-700">
            Suggested roles: {detail.candidate.persona.suggestedJobTitles.slice(0, 5).join(", ") || "-"}
          </p>

          {detail.candidate.resumeSignals ? (
            <div className="mt-3 rounded border border-slate-200 p-3 text-sm">
              <p className="font-semibold">Parsed resume signals</p>
              <p className="mt-1 text-slate-700">{detail.candidate.resumeSignals.summary ?? "-"}</p>
              <p className="text-slate-700">
                Top skills: {detail.candidate.resumeSignals.topSkills.slice(0, 8).join(", ") || "-"}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">No parsed resume signals available.</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-5 shadow-lg">
        <h2 className="text-lg font-semibold">Application and Employer Actions</h2>
        <p className="mt-2 text-sm text-slate-700">
          Current application status: {detail.application?.status ?? "none"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={acting}
            onClick={() => void handleExportCandidate()}
            className="rounded bg-indigo-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            Export Handoff Packet
          </button>
          <button
            type="button"
            disabled={acting}
            onClick={() => void handleAction("review")}
            className="rounded border border-slate-400 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            Mark Reviewed
          </button>
          <button
            type="button"
            disabled={acting}
            onClick={() => void handleAction("shortlist")}
            className="rounded bg-emerald-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            Shortlist
          </button>
          <button
            type="button"
            disabled={acting}
            onClick={() => void handleAction("reject")}
            className="rounded bg-rose-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={acting}
            onClick={() => void handleAction("reset")}
            className="rounded border border-slate-400 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            Reset
          </button>
        </div>

        {detail.application?.recentEvents && detail.application.recentEvents.length > 0 ? (
          <div className="mt-4">
            <p className="text-sm font-semibold">Recent activity</p>
            <ul className="mt-2 space-y-2 text-sm">
              {detail.application.recentEvents.map((event, index) => (
                <li key={`${event.occurredAt}-${index}`} className="rounded border border-slate-200 p-2">
                  <p className="font-medium">
                    {event.eventType} {event.toStatus ? `-> ${event.toStatus}` : ""}
                  </p>
                  <p className="text-slate-600">{event.note ?? event.reasonCode ?? "Status update"}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
