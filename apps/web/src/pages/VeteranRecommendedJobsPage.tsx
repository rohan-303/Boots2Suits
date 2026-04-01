import { useEffect, useState } from "react";
import { getVeteranJobRecommendations, getVeteranProfile } from "../lib/api";
import type { VeteranRecommendation } from "../types/matching";

function formatScore(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

export function VeteranRecommendedJobsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<VeteranRecommendation[]>([]);
  const [runId, setRunId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);

      const profileResult = await getVeteranProfile();
      if (!profileResult.ok || !profileResult.data?.profile?.id) {
        if (mounted) {
          setError(profileResult.error ?? "Veteran profile is required to fetch recommendations.");
          setLoading(false);
        }
        return;
      }

      const recommendationResult = await getVeteranJobRecommendations(profileResult.data.profile.id);
      if (!mounted) return;
      if (!recommendationResult.ok || !recommendationResult.data) {
        setError(recommendationResult.error ?? "Unable to fetch recommended jobs.");
        setLoading(false);
        return;
      }

      setRunId(recommendationResult.data.matchRun?.id ?? null);
      setResults(recommendationResult.data.results);
      setLoading(false);
    }

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading recommended jobs...</div>;
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
        <h1 className="text-2xl font-bold">Recommended Jobs</h1>
        <p className="mt-2 text-sm text-slate-600">
          Ranked jobs based on your profile and persona fit.
        </p>
        {runId ? <p className="mt-2 text-sm text-slate-500">Latest run: {runId.slice(0, 8)}...</p> : null}
        {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
      </div>

      <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
        {results.length === 0 ? (
          <p className="text-sm text-slate-600">
            No recommendations yet. An employer needs to run matching on a job to produce ranked results.
          </p>
        ) : (
          <ul className="space-y-3">
            {results.map((result) => (
              <li key={result.jobId} className="rounded border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      #{result.rank ?? "-"} {result.job.title}
                    </p>
                    <p className="text-sm text-slate-600">
                      {result.job.companyName} - {result.job.department ?? "General"} - {result.job.locationType}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{result.job.jobPersonaSummary ?? "-"}</p>
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
                      <div key={`${result.jobId}-${feature.featureName}`} className="rounded border border-slate-200 p-2 text-sm">
                        <p className="font-medium text-slate-800">{feature.featureName}</p>
                        <p className="text-slate-600">
                          impact: {feature.featureImpact?.toFixed(3) ?? "-"} | reason: {feature.reasonCode ?? "-"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
