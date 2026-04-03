import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  createEmployerJobExport,
  employerRejectCandidate,
  employerResetCandidateAction,
  employerReviewCandidate,
  employerShortlistCandidate,
  getEmployerJobExportDetail,
  getEmployerJobExports,
  getJobMatchResults,
  runJobMatching
} from "../lib/api";
import type { EmployerMatchResult, MatchRunMeta } from "../types/matching";
import type { JobCandidateExportDetail, JobCandidateExportSummary } from "../types/employer";

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
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
  const [exportTarget, setExportTarget] = useState<
    "manual_handoff" | "greenhouse_stub" | "greenhouse" | "lever" | "workday"
  >("manual_handoff");
  const [connectorSimulationMode, setConnectorSimulationMode] = useState<
    "success" | "retryable_failure" | "non_retryable_failure"
  >("success");
  const [exportsHistory, setExportsHistory] = useState<JobCandidateExportSummary[]>([]);
  const [selectedExportDetail, setSelectedExportDetail] = useState<JobCandidateExportDetail | null>(null);
  const [loadingExportDetailId, setLoadingExportDetailId] = useState<string | null>(null);

  async function loadExports() {
    if (!jobId) return;
    const result = await getEmployerJobExports(jobId);
    if (!result.ok || !result.data) return;
    setExportsHistory(result.data.exports);
  }

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
    setSelectedCandidateIds((prev) =>
      prev.filter((id) => result.data?.results.some((candidate) => candidate.veteranProfileId === id))
    );
    await loadExports();
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

  function toggleCandidateSelection(veteranProfileId: string) {
    setSelectedCandidateIds((prev) =>
      prev.includes(veteranProfileId)
        ? prev.filter((id) => id !== veteranProfileId)
        : [...prev, veteranProfileId]
    );
  }

  async function onExportSelected() {
    if (!jobId || selectedCandidateIds.length === 0) return;
    setExporting(true);
    setError(null);
    const result = await createEmployerJobExport(jobId, {
      candidateProfileIds: selectedCandidateIds,
      exportFormat,
      exportTarget,
      connectorSimulationMode
    });
    setExporting(false);
    if (!result.ok) {
      setError(result.error ?? "Unable to export selected candidates.");
      return;
    }
    await loadExports();
    setSelectedCandidateIds([]);
  }

  async function openExportDetail(exportId: string) {
    if (!jobId) return;
    setLoadingExportDetailId(exportId);
    const result = await getEmployerJobExportDetail(jobId, exportId);
    setLoadingExportDetailId(null);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to load export detail.");
      return;
    }
    setSelectedExportDetail({
      export: result.data.export,
      items: result.data.items
    });
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
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-800">Recruiter Handoff Export</p>
          <p className="mt-1 text-xs text-slate-600">
            Select candidates below and export concise handoff packets for recruiter workflows.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <label className="text-slate-700">Format</label>
            <select
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value as "json" | "csv")}
              className="rounded border border-slate-300 px-2 py-1"
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
            <label className="text-slate-700">Target</label>
            <select
              value={exportTarget}
              onChange={(event) =>
                setExportTarget(
                  event.target.value as
                    | "manual_handoff"
                    | "greenhouse_stub"
                    | "greenhouse"
                    | "lever"
                    | "workday"
                )
              }
              className="rounded border border-slate-300 px-2 py-1"
            >
              <option value="manual_handoff">manual_handoff</option>
              <option value="greenhouse_stub">greenhouse_stub</option>
              <option value="greenhouse">greenhouse</option>
              <option value="lever">lever</option>
              <option value="workday">workday</option>
            </select>
            {exportTarget !== "manual_handoff" ? (
              <>
                <label className="text-slate-700">Stub mode</label>
                <select
                  value={connectorSimulationMode}
                  onChange={(event) =>
                    setConnectorSimulationMode(
                      event.target.value as "success" | "retryable_failure" | "non_retryable_failure"
                    )
                  }
                  className="rounded border border-slate-300 px-2 py-1"
                >
                  <option value="success">success</option>
                  <option value="retryable_failure">retryable_failure</option>
                  <option value="non_retryable_failure">non_retryable_failure</option>
                </select>
              </>
            ) : null}
            <button
              type="button"
              disabled={exporting || selectedCandidateIds.length === 0}
              onClick={() => void onExportSelected()}
              className="rounded bg-indigo-700 px-3 py-1 font-semibold text-white disabled:opacity-50"
            >
              {exporting ? "Exporting..." : `Export Selected (${selectedCandidateIds.length})`}
            </button>
          </div>
        </div>
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
                <div className="mb-2">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={selectedCandidateIds.includes(result.veteranProfileId)}
                      onChange={() => toggleCandidateSelection(result.veteranProfileId)}
                    />
                    Select for Export
                  </label>
                </div>
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
                  <Link
                    to={`/app/employer/jobs/${jobId ?? ""}/candidates/${result.veteranProfileId}`}
                    className="rounded border border-amber-700 px-3 py-1 text-xs font-semibold text-amber-700"
                  >
                    Open Candidate Detail
                  </Link>
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

      <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Export History</h2>
        {exportsHistory.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            No exports yet. Select candidates and export a recruiter handoff packet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {exportsHistory.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 p-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-slate-800">
                    {entry.exportFormat.toUpperCase()} via {entry.connectorType}
                  </p>
                  <p className="text-xs text-slate-600">
                    status: {entry.exportStatus} | candidates: {entry.candidateCount} |{" "}
                    {new Date(entry.createdAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-600">
                    external: {entry.externalSource ?? "-"} {entry.externalId ? `| ref ${entry.externalId}` : ""}
                  </p>
                  {entry.errorMessage ? (
                    <p className="text-xs text-rose-700">
                      {entry.errorType ?? "ERROR"}: {entry.errorMessage}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void openExportDetail(entry.id)}
                  className="rounded border border-slate-400 px-3 py-1 text-xs font-semibold text-slate-700"
                >
                  {loadingExportDetailId === entry.id ? "Loading..." : "View"}
                </button>
              </li>
            ))}
          </ul>
        )}

        {selectedExportDetail ? (
          <div className="mt-4 rounded border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">
                Export Detail: {selectedExportDetail.export.id.slice(0, 8)}...
              </p>
              <button
                type="button"
                onClick={() => setSelectedExportDetail(null)}
                className="text-xs font-semibold text-slate-600 underline"
              >
                Close
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {selectedExportDetail.export.exportFormat.toUpperCase()} | {selectedExportDetail.export.connectorType} |{" "}
              {selectedExportDetail.export.exportStatus} | {selectedExportDetail.export.candidateCount} candidate(s)
            </p>
            <p className="mt-1 text-xs text-slate-600">
              External source: {selectedExportDetail.export.externalSource ?? "-"} | External id:{" "}
              {selectedExportDetail.export.externalId ?? "-"}
            </p>
            {selectedExportDetail.export.connectorRequestPayload ? (
              <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
                {JSON.stringify(selectedExportDetail.export.connectorRequestPayload, null, 2)}
              </pre>
            ) : null}
            {selectedExportDetail.export.connectorResponseSummary ? (
              <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
                {JSON.stringify(selectedExportDetail.export.connectorResponseSummary, null, 2)}
              </pre>
            ) : null}
            <div className="mt-2 space-y-2">
              {selectedExportDetail.items.slice(0, 5).map((item) => (
                <div key={item.veteranProfileId} className="rounded border border-slate-100 bg-slate-50 p-2 text-sm">
                  <p className="font-medium">
                    {(item.payload.candidate as { fullName?: string } | undefined)?.fullName ??
                      item.veteranProfileId}
                  </p>
                  <p className="text-xs text-slate-600">
                    score: {item.matchScore ?? "-"} | rank: {item.rank ?? "-"}
                  </p>
                  <p className="mt-1 text-xs text-slate-700">
                    {(
                      item.payload.handoffSummary as { whyRecommended?: string } | undefined
                    )?.whyRecommended ?? "No summary"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
