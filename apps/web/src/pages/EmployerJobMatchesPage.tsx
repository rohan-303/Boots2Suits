import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  employerRejectCandidate,
  employerResetCandidateAction,
  employerReviewCandidate,
  employerShortlistCandidate,
  getJobMatchResults,
  runJobMatching
} from "../lib/api";
import type { EmployerMatchResult, MatchRunMeta } from "../types/matching";

function formatScore(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

function runStatusLabel(run: MatchRunMeta | null) {
  if (!run) return "not run";
  return run.status;
}

export function EmployerJobMatchesPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState<string>("");
  const [matchRun, setMatchRun] = useState<MatchRunMeta | null>(null);
  const [results, setResults] = useState<EmployerMatchResult[]>([]);
  const [actingCandidateId, setActingCandidateId] = useState<string | null>(null);

  async function load() {
    if (!jobId) return;
    setLoading(true);
    const result = await getJobMatchResults(jobId);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to load match results.");
      setLoading(false);
      return;
    }

    setJobTitle(result.data.job.title);
    setMatchRun(result.data.matchRun);
    setResults(result.data.results);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [jobId]);

  useEffect(() => {
    if (!matchRun || (matchRun.status !== "queued" && matchRun.status !== "running")) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void load();
    }, 3000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [jobId, matchRun?.id, matchRun?.status]);

  async function onRunMatching() {
    if (!jobId) return;
    setRunning(true);
    setError(null);
    const result = await runJobMatching(jobId);
    setRunning(false);
    if (!result.ok) {
      setError(result.error ?? "Unable to run matching.");
      return;
    }
    await load();
  }

  async function handleCandidateAction(
    veteranProfileId: string,
    action: "review" | "shortlist" | "reject" | "reset"
  ) {
    if (!jobId) return;
    setActingCandidateId(veteranProfileId);
    setError(null);

    const result =
      action === "review"
        ? await employerReviewCandidate(jobId, veteranProfileId)
        : action === "shortlist"
        ? await employerShortlistCandidate(jobId, veteranProfileId)
        : action === "reject"
        ? await employerRejectCandidate(jobId, veteranProfileId)
        : await employerResetCandidateAction(jobId, veteranProfileId);

    setActingCandidateId(null);
    if (!result.ok) {
      setError(result.error ?? "Unable to update candidate action.");
      return;
    }

    await load();
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading match results...</div>;
  }

  const runInProgress = matchRun?.status === "queued" || matchRun?.status === "running";

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Match Results: {jobTitle || "Job"}</h1>
            <p className="mt-2 text-sm text-slate-600">
              Ranked candidates with explainable hybrid scoring.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onRunMatching()}
            disabled={running || runInProgress}
            className="rounded bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {running || runInProgress ? "Queueing/Running..." : "Run Matching"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link
            className="font-semibold text-amber-700 underline"
            to={`/app/employer/jobs/${jobId ?? ""}`}
          >
            Back to Job
          </Link>
          <p className="text-slate-500">Run status: {runStatusLabel(matchRun)}</p>
          {matchRun ? <p className="text-slate-500">Latest run: {matchRun.id.slice(0, 8)}...</p> : null}
          {matchRun ? (
            <p className="text-slate-500">Embedding mode/model: {matchRun.embeddingModelVersion}</p>
          ) : null}
        </div>
        {matchRun?.status === "failed" && matchRun.errorMessage ? (
          <p className="mt-2 text-sm font-medium text-rose-700">
            Last run failed: {matchRun.errorMessage}
          </p>
        ) : null}
        {runInProgress ? (
          <p className="mt-2 text-sm text-blue-700">
            Matching is in progress. Results will refresh automatically.
          </p>
        ) : null}
        {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
      </div>

      <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
        {results.length === 0 ? (
          <p className="text-sm text-slate-600">
            {runInProgress
              ? "Matching run is in progress. Candidate rankings will appear when completed."
              : "No match results yet. Run matching to generate ranked candidates for this job."}
          </p>
        ) : (
          <ul className="space-y-3">
            {results.map((result) => (
              <li key={result.veteranProfileId} className="rounded border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      #{result.rank ?? "-"} {result.candidate.fullName ?? "Veteran Candidate"}
                    </p>
                    <p className="text-sm text-slate-600">
                      {result.candidate.militaryBranch ?? "-"}{" "}
                      {result.candidate.mosCode ? `(${result.candidate.mosCode})` : ""}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{result.candidate.personaSummary ?? "-"}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      Pipeline status: {result.application?.status ?? "none"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm">
                    <p>
                      <strong>Match:</strong> {formatScore(result.score)}
                    </p>
                    <p>
                      <strong>Semantic:</strong> {formatScore(result.semanticScore)}
                    </p>
                    <p>
                      <strong>Rule:</strong> {formatScore(result.ruleScore)}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="text-sm font-semibold">Top explanations</p>
                  <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                    {result.explanationBullets.length > 0 ? (
                      result.explanationBullets.map((bullet, index) => <li key={index}>{bullet}</li>)
                    ) : (
                      <li>{result.explanation}</li>
                    )}
                  </ul>
                </div>

                <div className="mt-3">
                  <p className="text-sm font-semibold">Score components</p>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    {result.topFeatures.map((feature) => (
                      <div
                        key={`${result.veteranProfileId}-${feature.featureName}`}
                        className="rounded border border-slate-200 p-2 text-sm"
                      >
                        <p className="font-medium text-slate-800">{feature.featureName}</p>
                        <p className="text-slate-600">
                          impact: {feature.featureImpact?.toFixed(3) ?? "-"} | reason:{" "}
                          {feature.reasonCode ?? "-"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={actingCandidateId === result.veteranProfileId}
                    onClick={() => void handleCandidateAction(result.veteranProfileId, "review")}
                    className="rounded border border-slate-400 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
                  >
                    Mark Reviewed
                  </button>
                  <button
                    type="button"
                    disabled={actingCandidateId === result.veteranProfileId}
                    onClick={() => void handleCandidateAction(result.veteranProfileId, "shortlist")}
                    className="rounded bg-emerald-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Shortlist
                  </button>
                  <button
                    type="button"
                    disabled={actingCandidateId === result.veteranProfileId}
                    onClick={() => void handleCandidateAction(result.veteranProfileId, "reject")}
                    className="rounded bg-rose-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={actingCandidateId === result.veteranProfileId}
                    onClick={() => void handleCandidateAction(result.veteranProfileId, "reset")}
                    className="rounded border border-slate-400 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
                  >
                    Reset
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
