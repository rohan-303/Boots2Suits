import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  loadDataset,
  resolveScoringConfig,
  runEvaluation,
  writeReport
} from "./core.js";

const metricKeys = [
  "top1Accuracy",
  "top3InclusionRate",
  "meanReciprocalRank",
  "explanationSignalPassRate"
] as const;

type MetricKey = (typeof metricKeys)[number];

const baselineSchema = z.object({
  name: z.string().min(1),
  datasetPath: z.string().min(1),
  embeddingMode: z.enum(["structured_fallback", "real_embeddings"]).default("structured_fallback"),
  embeddingModelVersion: z.string().min(1),
  minimumThresholds: z.object({
    top1Accuracy: z.number().min(0).max(1),
    top3InclusionRate: z.number().min(0).max(1),
    meanReciprocalRank: z.number().min(0).max(1),
    explanationSignalPassRate: z.number().min(0).max(1)
  }),
  lockedMetrics: z.object({
    top1Accuracy: z.number().min(0).max(1),
    top3InclusionRate: z.number().min(0).max(1),
    meanReciprocalRank: z.number().min(0).max(1),
    explanationSignalPassRate: z.number().min(0).max(1)
  }),
  maxAllowedDegradation: z.object({
    top1Accuracy: z.number().min(0).max(1),
    top3InclusionRate: z.number().min(0).max(1),
    meanReciprocalRank: z.number().min(0).max(1),
    explanationSignalPassRate: z.number().min(0).max(1)
  })
});

function getArgValue(args: string[], key: string) {
  const idx = args.findIndex((arg) => arg === key);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

function parseBaseline(args: string[]) {
  const baselineArg = getArgValue(args, "--baseline");
  const baselinePath = path.resolve(
    process.cwd(),
    baselineArg ?? "src/matching/eval/baseline/starter-baseline.json"
  );
  const raw = fs.readFileSync(baselinePath, "utf8");
  const parsed = baselineSchema.parse(JSON.parse(raw));
  return { baselinePath, baseline: parsed };
}

function format(value: number) {
  return value.toFixed(4);
}

function statusLabel(delta: number) {
  if (delta > 0.0001) return "improved";
  if (delta < -0.0001) return "degraded";
  return "unchanged";
}

function main() {
  const args = process.argv.slice(2);
  const { baselinePath, baseline } = parseBaseline(args);
  const scoringConfig = resolveScoringConfig(args);
  const datasetPath = path.resolve(process.cwd(), baseline.datasetPath);
  const dataset = loadDataset(datasetPath);

  const report = runEvaluation(dataset, scoringConfig, {
    embeddingMode: baseline.embeddingMode,
    embeddingModelVersion: baseline.embeddingModelVersion
  });

  const failures: string[] = [];
  console.log("Boots2Suits Matching Quality Gate");
  console.log(`Baseline: ${baseline.name}`);
  console.log(`Baseline file: ${baselinePath}`);
  console.log(`Dataset: ${datasetPath}`);
  console.log(`Scoring config: ${scoringConfig.version}`);
  console.log(`Embedding mode: ${baseline.embeddingMode}`);
  console.log(`Embedding model: ${baseline.embeddingModelVersion}`);
  console.log("");
  console.log("Metric Comparison");

  for (const metric of metricKeys) {
    const current = report.metrics[metric];
    const minimum = baseline.minimumThresholds[metric];
    const locked = baseline.lockedMetrics[metric];
    const maxDeg = baseline.maxAllowedDegradation[metric];
    const delta = Number((current - locked).toFixed(4));
    const degradation = locked - current;
    const qualityStatus = statusLabel(delta);

    const thresholdPass = current >= minimum;
    const baselinePass = degradation <= maxDeg;
    const pass = thresholdPass && baselinePass;
    if (!pass) {
      failures.push(
        `${metric} failed: current=${format(current)} min=${format(minimum)} locked=${format(locked)} maxDegradation=${format(maxDeg)}`
      );
    }

    console.log(
      `- ${metric}: current=${format(current)} min=${format(minimum)} locked=${format(
        locked
      )} delta=${delta >= 0 ? "+" : ""}${format(delta)} (${qualityStatus}) ${
        pass ? "PASS" : "FAIL"
      }`
    );
  }

  const outArg = getArgValue(args, "--out");
  const outPath =
    outArg ??
    path.resolve("reports", `matching-quality-gate-${scoringConfig.version}-${Date.now()}.json`);
  const written = writeReport(report, outPath);
  console.log("");
  console.log(`Evaluation report written: ${written}`);

  if (failures.length > 0) {
    console.error("");
    console.error("Quality gate failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Quality gate passed.");
}

main();
