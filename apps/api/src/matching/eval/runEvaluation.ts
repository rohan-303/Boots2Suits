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
  const embeddingModeArg = getArgValue(args, "--embedding-mode");
  const embeddingMode =
    embeddingModeArg === "real_embeddings" ? "real_embeddings" : "structured_fallback";
  const embeddingModelVersion =
    getArgValue(args, "--embedding-model-version") ??
    (embeddingMode === "real_embeddings" ? "eval-embedding-sim-v1" : "structured-fallback-v1");
  const datasetPath = resolveDatasetPath(args);
  const scoringConfig = resolveScoringConfig(args);
  const dataset = loadDataset(datasetPath);
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
