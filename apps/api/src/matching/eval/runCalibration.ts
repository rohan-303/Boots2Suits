import fs from "node:fs";
import path from "node:path";
import { defaultScoringConfig, validateScoringConfig } from "../scoringConfig.js";
import {
  loadDataset,
  resolveDatasetPath,
  runEvaluation,
  writeReport
} from "./core.js";

function getArgValue(args: string[], key: string) {
  const idx = args.findIndex((arg) => arg === key);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

function readConfig(configPath: string) {
  const content = fs.readFileSync(path.resolve(process.cwd(), configPath), "utf8");
  return validateScoringConfig(JSON.parse(content));
}

function main() {
  const args = process.argv.slice(2);
  const datasetPath = resolveDatasetPath(args);
  const candidateConfigPath = getArgValue(args, "--candidate");

  if (!candidateConfigPath) {
    throw new Error("Missing --candidate <path-to-config-json>");
  }

  const baselineConfigPath = getArgValue(args, "--baseline");
  const baselineConfig = baselineConfigPath ? readConfig(baselineConfigPath) : defaultScoringConfig;
  const candidateConfig = readConfig(candidateConfigPath);
  const dataset = loadDataset(datasetPath);

  const baselineReport = runEvaluation(dataset, baselineConfig);
  const candidateReport = runEvaluation(dataset, candidateConfig);

  const deltas = {
    top1AccuracyDelta: Number(
      (candidateReport.metrics.top1Accuracy - baselineReport.metrics.top1Accuracy).toFixed(4)
    ),
    top3InclusionRateDelta: Number(
      (
        candidateReport.metrics.top3InclusionRate - baselineReport.metrics.top3InclusionRate
      ).toFixed(4)
    ),
    meanReciprocalRankDelta: Number(
      (
        candidateReport.metrics.meanReciprocalRank - baselineReport.metrics.meanReciprocalRank
      ).toFixed(4)
    ),
    explanationSignalPassRateDelta: Number(
      (
        candidateReport.metrics.explanationSignalPassRate -
        baselineReport.metrics.explanationSignalPassRate
      ).toFixed(4)
    )
  };

  const defaultReportPath = path.resolve(
    "reports",
    `matching-calibration-${baselineConfig.version}-vs-${candidateConfig.version}-${Date.now()}.json`
  );
  const outPath = getArgValue(args, "--out") ?? defaultReportPath;
  const written = writeReport(
    {
      generatedAt: new Date().toISOString(),
      datasetVersion: dataset.version,
      scoringConfigVersion: `${baselineConfig.version} vs ${candidateConfig.version}`,
      scoringConfig: baselineConfig,
      metrics: candidateReport.metrics,
      cases: candidateReport.cases
    },
    outPath
  );

  console.log("Boots2Suits Matching Calibration");
  console.log(`Dataset: ${dataset.version}`);
  console.log(`Baseline: ${baselineConfig.version}`);
  console.log(`Candidate: ${candidateConfig.version}`);
  console.log("");
  console.log(`Top-1 accuracy delta: ${deltas.top1AccuracyDelta}`);
  console.log(`Top-3 inclusion delta: ${deltas.top3InclusionRateDelta}`);
  console.log(`MRR delta: ${deltas.meanReciprocalRankDelta}`);
  console.log(`Explanation pass delta: ${deltas.explanationSignalPassRateDelta}`);
  console.log("");
  console.log(`Report written: ${written}`);
}

main();
