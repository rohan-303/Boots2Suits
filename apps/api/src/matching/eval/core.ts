import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MatchInput } from "../engine.js";
import { scoreCandidateJobMatch } from "../engine.js";
import {
  defaultScoringConfig,
  type MatchingScoringConfig,
  validateScoringConfig
} from "../scoringConfig.js";
import { evaluationDatasetSchema, type EvaluationDataset } from "./types.js";

export type EvaluationMetrics = {
  totalCases: number;
  top1Correct: number;
  top1Accuracy: number;
  top3Inclusion: number;
  top3InclusionRate: number;
  meanReciprocalRank: number;
  avgExpectedRank: number;
  explanationSignalPassRate: number;
};

export type EvaluationCaseResult = {
  caseId: string;
  title: string;
  expectedTopCandidateId: string;
  actualTopCandidateId: string | null;
  top1Correct: boolean;
  top3Inclusion: boolean;
  expectedRank: number | null;
  reciprocalRank: number;
  explanationSignalChecks: Array<{
    candidateId: string;
    expectedReasonCode: string;
    present: boolean;
  }>;
  ranked: Array<{
    candidateId: string;
    label: string;
    rank: number;
    score: number;
    semanticScore: number;
    ruleScore: number;
    topReasonCodes: string[];
  }>;
};

export type EvaluationReport = {
  generatedAt: string;
  datasetVersion: string;
  scoringConfigVersion: string;
  scoringConfig: MatchingScoringConfig;
  metrics: EvaluationMetrics;
  cases: EvaluationCaseResult[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DATASET_PATH = path.resolve(__dirname, "data/starter-dataset.json");

function getArgValue(args: string[], key: string) {
  const idx = args.findIndex((arg) => arg === key);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

export function resolveDatasetPath(args: string[]) {
  const datasetArg = getArgValue(args, "--dataset");
  if (!datasetArg) return DEFAULT_DATASET_PATH;
  return path.resolve(process.cwd(), datasetArg);
}

export function resolveScoringConfig(args: string[]): MatchingScoringConfig {
  const configArg = getArgValue(args, "--config");
  if (!configArg) return defaultScoringConfig;
  const resolvedPath = path.resolve(process.cwd(), configArg);
  const content = fs.readFileSync(resolvedPath, "utf8");
  const parsed = JSON.parse(content);
  return validateScoringConfig(parsed);
}

export function loadDataset(datasetPath: string): EvaluationDataset {
  const raw = fs.readFileSync(datasetPath, "utf8");
  const parsed = JSON.parse(raw);
  return evaluationDatasetSchema.parse(parsed);
}

function rankCandidates(
  caseInput: EvaluationDataset["cases"][number],
  scoringConfig: MatchingScoringConfig
) {
  const ranked = caseInput.candidates
    .map((candidate) => {
      const score = scoreCandidateJobMatch(
        {
          job: caseInput.job as MatchInput["job"],
          jobPersona: caseInput.jobPersona as MatchInput["jobPersona"],
          veteran: candidate.veteran as MatchInput["veteran"],
          veteranPersona: candidate.veteranPersona as MatchInput["veteranPersona"]
        },
        scoringConfig
      );

      return {
        candidateId: candidate.id,
        label: candidate.label,
        score: score.score,
        semanticScore: score.semanticScore,
        ruleScore: score.ruleScore,
        reasonCodes: score.features
          .sort((a, b) => Math.abs(b.featureImpact) - Math.abs(a.featureImpact))
          .map((feature) => feature.reasonCode),
        raw: score
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((row, index) => ({
      ...row,
      rank: index + 1
    }));

  return ranked;
}

export function runEvaluation(
  dataset: EvaluationDataset,
  scoringConfig: MatchingScoringConfig
): EvaluationReport {
  const caseResults: EvaluationCaseResult[] = dataset.cases.map((entry) => {
    const ranked = rankCandidates(entry, scoringConfig);
    const expectedTop = entry.expectations.expectedTopCandidateId;
    const actualTop = ranked[0]?.candidateId ?? null;
    const expectedRank = ranked.find((item) => item.candidateId === expectedTop)?.rank ?? null;
    const top3Candidates = ranked.slice(0, 3).map((item) => item.candidateId);
    const expectedTop3 = entry.expectations.expectedTop3CandidateIds ?? [expectedTop];
    const top3Inclusion = expectedTop3.every((candidateId) => top3Candidates.includes(candidateId));

    const explanationSignalChecks: EvaluationCaseResult["explanationSignalChecks"] = [];
    for (const [candidateId, reasonCodes] of Object.entries(
      entry.expectations.expectedReasonCodesByCandidate ?? {}
    )) {
      const candidate = ranked.find((item) => item.candidateId === candidateId);
      for (const reasonCode of reasonCodes) {
        explanationSignalChecks.push({
          candidateId,
          expectedReasonCode: reasonCode,
          present: Boolean(candidate?.reasonCodes.includes(reasonCode))
        });
      }
    }

    return {
      caseId: entry.id,
      title: entry.title,
      expectedTopCandidateId: expectedTop,
      actualTopCandidateId: actualTop,
      top1Correct: actualTop === expectedTop,
      top3Inclusion,
      expectedRank,
      reciprocalRank: expectedRank ? 1 / expectedRank : 0,
      explanationSignalChecks,
      ranked: ranked.map((candidate) => ({
        candidateId: candidate.candidateId,
        label: candidate.label,
        rank: candidate.rank,
        score: Number(candidate.score.toFixed(6)),
        semanticScore: Number(candidate.semanticScore.toFixed(6)),
        ruleScore: Number(candidate.ruleScore.toFixed(6)),
        topReasonCodes: candidate.reasonCodes.slice(0, 5)
      }))
    };
  });

  const top1Correct = caseResults.filter((item) => item.top1Correct).length;
  const top3Inclusion = caseResults.filter((item) => item.top3Inclusion).length;
  const reciprocalRanks = caseResults.map((item) => item.reciprocalRank);
  const expectedRanks = caseResults
    .map((item) => item.expectedRank)
    .filter((value): value is number => value !== null);
  const explanationChecks = caseResults.flatMap((item) => item.explanationSignalChecks);
  const explanationChecksPassed = explanationChecks.filter((check) => check.present).length;

  const metrics: EvaluationMetrics = {
    totalCases: caseResults.length,
    top1Correct,
    top1Accuracy: Number((top1Correct / caseResults.length).toFixed(4)),
    top3Inclusion,
    top3InclusionRate: Number((top3Inclusion / caseResults.length).toFixed(4)),
    meanReciprocalRank: Number(
      (
        reciprocalRanks.reduce((sum, value) => sum + value, 0) / Math.max(reciprocalRanks.length, 1)
      ).toFixed(4)
    ),
    avgExpectedRank: Number(
      (
        expectedRanks.reduce((sum, value) => sum + value, 0) / Math.max(expectedRanks.length, 1)
      ).toFixed(4)
    ),
    explanationSignalPassRate:
      explanationChecks.length === 0
        ? 1
        : Number((explanationChecksPassed / explanationChecks.length).toFixed(4))
  };

  return {
    generatedAt: new Date().toISOString(),
    datasetVersion: dataset.version,
    scoringConfigVersion: scoringConfig.version,
    scoringConfig,
    metrics,
    cases: caseResults
  };
}

export function writeReport(report: EvaluationReport, reportPath: string) {
  const resolved = path.resolve(process.cwd(), reportPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(report, null, 2), "utf8");
  return resolved;
}
