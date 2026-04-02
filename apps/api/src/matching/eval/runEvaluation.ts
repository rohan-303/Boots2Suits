import path from "node:path";
import {
  loadDataset,
  resolveDatasetPath,
  resolveScoringConfig,
  runEvaluation,
  writeReport
} from "./core.js";

function getArgValue(args: string[], key: string) {
  const idx = args.findIndex((arg) => arg === key);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

function printSummary(report: ReturnType<typeof runEvaluation>) {
  console.log("Boots2Suits Matching Evaluation");
  console.log(`Dataset: ${report.datasetVersion}`);
  console.log(`Scoring config: ${report.scoringConfigVersion}`);
  console.log(`Embedding mode: ${report.embeddingMode}`);
  console.log(`Embedding model: ${report.embeddingModelVersion}`);
  console.log(`Generated: ${report.generatedAt}`);
  console.log("");
  console.log(`Top-1 accuracy: ${report.metrics.top1Accuracy} (${report.metrics.top1Correct}/${report.metrics.totalCases})`);
  console.log(`Top-3 inclusion: ${report.metrics.top3InclusionRate} (${report.metrics.top3Inclusion}/${report.metrics.totalCases})`);
  console.log(`Mean reciprocal rank: ${report.metrics.meanReciprocalRank}`);
  console.log(`Average expected rank: ${report.metrics.avgExpectedRank}`);
  console.log(`Explanation signal pass rate: ${report.metrics.explanationSignalPassRate}`);
  console.log("");

  for (const caseResult of report.cases) {
    console.log(
      `[${caseResult.caseId}] top1=${caseResult.top1Correct ? "PASS" : "FAIL"} expected=${caseResult.expectedTopCandidateId} actual=${caseResult.actualTopCandidateId ?? "none"} rank=${caseResult.expectedRank ?? "n/a"}`
    );
  }
}

function main() {
  const args = process.argv.slice(2);
  const compareModes = args.includes("--compare-modes");
  const embeddingModeArg = getArgValue(args, "--embedding-mode");
  const embeddingMode =
    embeddingModeArg === "real_embeddings" ? "real_embeddings" : "structured_fallback";
  const embeddingModelVersion =
    getArgValue(args, "--embedding-model-version") ??
    (embeddingMode === "real_embeddings" ? "eval-embedding-sim-v1" : "structured-fallback-v1");
  const datasetPath = resolveDatasetPath(args);
  const scoringConfig = resolveScoringConfig(args);
  const dataset = loadDataset(datasetPath);

  if (compareModes) {
    const structured = runEvaluation(dataset, scoringConfig, {
      embeddingMode: "structured_fallback",
      embeddingModelVersion: "structured-fallback-v1"
    });
    const hybrid = runEvaluation(dataset, scoringConfig, {
      embeddingMode: "real_embeddings",
      embeddingModelVersion
    });
    const comparison = {
      generatedAt: new Date().toISOString(),
      datasetVersion: dataset.version,
      scoringConfigVersion: scoringConfig.version,
      baseline: {
        mode: "structured_fallback",
        metrics: structured.metrics
      },
      candidate: {
        mode: "real_embeddings",
        metrics: hybrid.metrics
      },
      deltas: {
        top1Accuracy: Number((hybrid.metrics.top1Accuracy - structured.metrics.top1Accuracy).toFixed(4)),
        top3InclusionRate: Number(
          (hybrid.metrics.top3InclusionRate - structured.metrics.top3InclusionRate).toFixed(4)
        ),
        meanReciprocalRank: Number(
          (hybrid.metrics.meanReciprocalRank - structured.metrics.meanReciprocalRank).toFixed(4)
        ),
        explanationSignalPassRate: Number(
          (
            hybrid.metrics.explanationSignalPassRate - structured.metrics.explanationSignalPassRate
          ).toFixed(4)
        )
      }
    };

    const defaultComparePath = path.resolve(
      "reports",
      `matching-eval-compare-${scoringConfig.version}-${Date.now()}.json`
    );
    const comparePath = getArgValue(args, "--out") ?? defaultComparePath;
    const written = writeReport(
      {
        generatedAt: comparison.generatedAt,
        datasetVersion: comparison.datasetVersion,
        scoringConfigVersion: `${scoringConfig.version}-compare`,
        embeddingMode: "real_embeddings",
        embeddingModelVersion,
        scoringConfig,
        metrics: hybrid.metrics,
        cases: hybrid.cases
      },
      comparePath
    );

    console.log("Boots2Suits Matching Evaluation Comparison");
    console.log(`Dataset: ${comparison.datasetVersion}`);
    console.log(`Scoring config: ${comparison.scoringConfigVersion}`);
    console.log("");
    console.log(`Top-1 delta (hybrid - structured): ${comparison.deltas.top1Accuracy}`);
    console.log(`Top-3 delta (hybrid - structured): ${comparison.deltas.top3InclusionRate}`);
    console.log(`MRR delta (hybrid - structured): ${comparison.deltas.meanReciprocalRank}`);
    console.log(
      `Explanation pass delta (hybrid - structured): ${comparison.deltas.explanationSignalPassRate}`
    );
    console.log("");
    console.log(`Hybrid report written: ${written}`);
    return;
  }

  const report = runEvaluation(dataset, scoringConfig, {
    embeddingMode,
    embeddingModelVersion
  });

  const defaultReportPath = path.resolve(
    "reports",
    `matching-eval-${scoringConfig.version}-${Date.now()}.json`
  );
  const reportPath = getArgValue(args, "--out") ?? defaultReportPath;
  const written = writeReport(report, reportPath);

  printSummary(report);
  console.log("");
  console.log(`Report written: ${written}`);
}

main();
