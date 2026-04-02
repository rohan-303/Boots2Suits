import { createHash } from "node:crypto";
import {
  defaultScoringConfig,
  type MatchFeatureKey,
  type MatchingScoringConfig
} from "./scoringConfig.js";

const CLEARANCE_ORDER = ["none", "confidential", "secret", "top_secret", "ts_sci", "other"];

const STOPWORDS = new Set([
  "and",
  "or",
  "the",
  "for",
  "with",
  "in",
  "of",
  "to",
  "a",
  "an",
  "on",
  "at",
  "role",
  "roles",
  "team",
  "teams"
]);

export type MatchInput = {
  job: {
    id: string;
    title: string;
    department: string | null;
    locationType: "onsite" | "hybrid" | "remote";
    locationState: string | null;
    compensationMin: number | null;
    compensationMax: number | null;
    mustHaveSkills: string[];
    niceToHaveSkills: string[];
    requiredExperienceLevel: string | null;
    clearanceRequirement: string | null;
  };
  jobPersona: {
    suggestedRoleFamily: string | null;
    leadershipLevel: string | null;
    suggestedCandidateArchetypes: string[];
  } | null;
  veteran: {
    id: string;
    userId: string;
    locationState: string | null;
    preferredWorkModes: string[];
    yearsOfService: number | null;
    clearanceLevel: string | null;
    salaryExpectationMin: number | null;
    salaryExpectationMax: number | null;
    keySkills: string[];
    desiredRoles: string[];
    highestRank: string | null;
    leadershipExperience: string | null;
  };
  veteranPersona: {
    roleClusters: string[];
    suggestedJobTitles: string[];
    leadershipProfile: string | null;
    experienceLevel: string | null;
  } | null;
};

type FeatureContribution = {
  featureName: MatchFeatureKey;
  featureWeight: number;
  featureValue: number;
  featureImpact: number;
  reasonCode: string;
  detail: string;
};

export type MatchScoreResult = {
  score: number;
  semanticScore: number;
  ruleScore: number;
  explanation: string;
  explanationBullets: string[];
  explanationData: {
    formulaVersion: string;
    scoringConfigVersion: string;
    semanticMode: "real_embeddings" | "structured_fallback";
    embeddingModelVersion: string;
    embeddingSimilarity: number | null;
    structuredSemanticScore: number;
    componentScores: Record<string, number>;
    weights: Record<string, number>;
    topContributors: Array<{
      feature: string;
      impact: number;
      reasonCode: string;
      detail: string;
    }>;
  };
  features: FeatureContribution[];
  sourceSnapshotHash: string;
};

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function toKeywords(values: string[]) {
  const keywords = new Set<string>();
  for (const value of values) {
    const parts = normalizeText(value)
      .split(/[^a-z0-9]+/g)
      .filter((part) => part.length > 2 && !STOPWORDS.has(part));
    for (const part of parts) {
      keywords.add(part);
    }
  }
  return keywords;
}

function overlapScore(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const item of left) {
    if (right.has(item)) overlap += 1;
  }
  return overlap / right.size;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function safeNormalize(value: number, denominator: number) {
  if (denominator <= 0) return 0;
  return value / denominator;
}

function parseClearanceLevel(value: string | null) {
  if (!value) return 0;
  const normalized = normalizeText(value);
  const index = CLEARANCE_ORDER.indexOf(normalized);
  return index === -1 ? 0 : index;
}

function inferVeteranLeadershipLevel(input: MatchInput["veteran"], persona: MatchInput["veteranPersona"]) {
  const rank = normalizeText(input.highestRank ?? "");
  const leadershipText = normalizeText(
    `${input.leadershipExperience ?? ""} ${persona?.leadershipProfile ?? ""}`
  );

  const highSignals =
    rank.includes("major") ||
    rank.includes("colonel") ||
    rank.includes("commander") ||
    rank.includes("captain") ||
    leadershipText.includes("command") ||
    leadershipText.includes("managed") ||
    leadershipText.includes("led teams");

  if (highSignals || (input.yearsOfService ?? 0) >= 12) return "high";
  if ((input.yearsOfService ?? 0) >= 6 || leadershipText.includes("led")) return "medium";
  return "individual_contributor";
}

function requiredYearsForExperienceLevel(value: string | null) {
  const text = normalizeText(value ?? "");
  if (!text) return 0;
  if (text.includes("entry") || text.includes("junior")) return 1;
  if (text.includes("mid")) return 4;
  if (text.includes("senior")) return 8;
  if (text.includes("lead") || text.includes("principal") || text.includes("director")) return 10;
  return 3;
}

function inferYearsFromPersonaLevel(value: string | null) {
  const text = normalizeText(value ?? "");
  if (!text) return null;
  if (text.includes("senior")) return 8;
  if (text.includes("mid")) return 4;
  if (text.includes("entry")) return 1;
  return null;
}

function reasonCode(base: string, score: number) {
  if (score >= 0.8) return `${base}_strong`;
  if (score >= 0.55) return `${base}_partial`;
  return `${base}_gap`;
}

function detailForFeature(feature: MatchFeatureKey, score: number) {
  if (feature === "skillSimilarity") {
    if (score >= 0.8) return "Strong must-have skill overlap with job requirements.";
    if (score >= 0.55) return "Partial overlap on required and preferred skills.";
    return "Limited overlap on required skills.";
  }
  if (feature === "personaFit") {
    if (score >= 0.8) return "Role clusters align closely with job archetype and role family.";
    if (score >= 0.55) return "Some role-cluster alignment with job persona.";
    return "Role-cluster alignment with job persona is weak.";
  }
  if (feature === "leadershipFit") {
    if (score >= 0.8) return "Leadership profile aligns with role expectations.";
    if (score >= 0.55) return "Leadership alignment is acceptable but not ideal.";
    return "Leadership expectations may exceed candidate profile.";
  }
  if (feature === "experienceFit") {
    if (score >= 0.8) return "Experience level meets or exceeds role expectations.";
    if (score >= 0.55) return "Experience is close to role expectations.";
    return "Experience appears below role expectations.";
  }
  if (feature === "locationFit") {
    if (score >= 0.8) return "Work mode and location preference align well.";
    if (score >= 0.55) return "Location fit is workable with some compromise.";
    return "Location/work mode fit is weak.";
  }
  if (feature === "clearanceFit") {
    if (score >= 0.8) return "Clearance requirement is satisfied.";
    if (score >= 0.55) return "Clearance fit is partial.";
    return "Clearance requirement is not satisfied.";
  }
  if (score >= 0.8) return "Compensation expectations align.";
  if (score >= 0.55) return "Compensation alignment is plausible.";
  return "Compensation expectations may not align.";
}

function topExplanationBullets(features: FeatureContribution[]) {
  const top = [...features]
    .sort((a, b) => Math.abs(b.featureImpact) - Math.abs(a.featureImpact))
    .slice(0, 3);
  return top.map((feature) => feature.detail);
}

export function scoreCandidateJobMatch(
  input: MatchInput,
  scoringConfig: MatchingScoringConfig = defaultScoringConfig,
  options?: {
    embeddingSimilarity?: number | null;
    embeddingModelVersion?: string | null;
  }
): MatchScoreResult {
  const weights = scoringConfig.weights;
  const veteranSkills = toKeywords(input.veteran.keySkills);
  const mustSkills = toKeywords(input.job.mustHaveSkills);
  const niceSkills = toKeywords(input.job.niceToHaveSkills);

  const mustScore = mustSkills.size > 0 ? overlapScore(veteranSkills, mustSkills) : 0.6;
  const niceScore = niceSkills.size > 0 ? overlapScore(veteranSkills, niceSkills) : 0.5;
  const skillSimilarity = clamp01(mustScore * 0.75 + niceScore * 0.25);

  const veteranRoleSignals = toKeywords([
    ...input.veteran.desiredRoles,
    ...(input.veteranPersona?.roleClusters ?? []),
    ...(input.veteranPersona?.suggestedJobTitles ?? [])
  ]);
  const jobRoleSignals = toKeywords([
    input.job.title,
    input.job.department ?? "",
    input.jobPersona?.suggestedRoleFamily ?? "",
    ...(input.jobPersona?.suggestedCandidateArchetypes ?? [])
  ]);
  const personaFit = clamp01(overlapScore(veteranRoleSignals, jobRoleSignals));

  const veteranLeadership = inferVeteranLeadershipLevel(input.veteran, input.veteranPersona);
  const expectedLeadership = normalizeText(input.jobPersona?.leadershipLevel ?? "individual_contributor");
  const leadershipFit =
    veteranLeadership === expectedLeadership
      ? 1
      : veteranLeadership === "high" && expectedLeadership === "medium"
      ? 0.8
      : veteranLeadership === "medium" && expectedLeadership === "individual_contributor"
      ? 0.8
      : 0.35;

  const inferredYears = inferYearsFromPersonaLevel(input.veteranPersona?.experienceLevel ?? null);
  const years = input.veteran.yearsOfService ?? inferredYears ?? 0;
  const requiredYears = requiredYearsForExperienceLevel(input.job.requiredExperienceLevel);
  const experienceGap = years - requiredYears;
  const experienceFit = experienceGap >= 0 ? 1 : experienceGap >= -2 ? 0.65 : 0.3;

  const preferredModes = new Set(input.veteran.preferredWorkModes.map((mode) => normalizeText(mode)));
  const jobMode = normalizeText(input.job.locationType);
  const modeFit = preferredModes.has(jobMode) ? 1 : jobMode === "remote" ? 0.7 : 0.35;
  const stateFit =
    input.job.locationState && input.veteran.locationState
      ? normalizeText(input.job.locationState) === normalizeText(input.veteran.locationState)
        ? 1
        : 0.4
      : 0.7;
  const locationFit = clamp01(modeFit * 0.8 + stateFit * 0.2);

  const requiredClearanceLevel = parseClearanceLevel(input.job.clearanceRequirement);
  const veteranClearanceLevel = parseClearanceLevel(input.veteran.clearanceLevel);
  const clearanceFit =
    requiredClearanceLevel === 0
      ? 1
      : veteranClearanceLevel >= requiredClearanceLevel
      ? 1
      : 0;

  const jobMin = input.job.compensationMin;
  const jobMax = input.job.compensationMax;
  const vetMin = input.veteran.salaryExpectationMin;
  const vetMax = input.veteran.salaryExpectationMax;
  let compensationFit = 0.5;
  if (jobMin !== null && jobMax !== null && vetMin !== null && vetMax !== null) {
    const overlapMin = Math.max(jobMin, vetMin);
    const overlapMax = Math.min(jobMax, vetMax);
    compensationFit = overlapMin <= overlapMax ? 1 : Math.abs(overlapMin - overlapMax) <= 10000 ? 0.6 : 0.2;
  }

  const componentScores = {
    skillSimilarity,
    personaFit,
    leadershipFit,
    experienceFit,
    locationFit,
    clearanceFit,
    compensationFit
  };

  const semanticWeight = weights.skillSimilarity + weights.personaFit;
  const structuredSemanticScore = clamp01(
    safeNormalize(
      skillSimilarity * weights.skillSimilarity + personaFit * weights.personaFit,
      semanticWeight
    )
  );
  const embeddingSimilarity =
    typeof options?.embeddingSimilarity === "number" ? clamp01(options.embeddingSimilarity) : null;
  const semanticMode = embeddingSimilarity !== null ? "real_embeddings" : "structured_fallback";
  const semanticScore =
    embeddingSimilarity !== null
      ? clamp01(embeddingSimilarity * 0.7 + structuredSemanticScore * 0.3)
      : structuredSemanticScore;
  const semanticEmbeddingModelVersion =
    semanticMode === "real_embeddings"
      ? options?.embeddingModelVersion ?? "unknown"
      : "structured-fallback-v1";

  const ruleWeight =
    weights.leadershipFit +
    weights.experienceFit +
    weights.locationFit +
    weights.clearanceFit +
    weights.compensationFit;
  const ruleScore = clamp01(
    safeNormalize(
      leadershipFit * weights.leadershipFit +
        experienceFit * weights.experienceFit +
        locationFit * weights.locationFit +
        clearanceFit * weights.clearanceFit +
        compensationFit * weights.compensationFit,
      ruleWeight
    )
  );

  const score = clamp01(semanticScore * semanticWeight + ruleScore * ruleWeight);

  const features: FeatureContribution[] = (Object.entries(componentScores) as Array<
    [MatchFeatureKey, number]
  >).map(([featureName, featureValue]) => {
    const featureWeight = weights[featureName];
    return {
      featureName,
      featureWeight,
      featureValue,
      featureImpact: (featureValue - 0.5) * 2 * featureWeight,
      reasonCode: reasonCode(featureName, featureValue),
      detail: detailForFeature(featureName, featureValue)
    };
  });
  const explanationBullets = topExplanationBullets(features);
  const explanation = explanationBullets.join(" ");

  const topContributors = [...features]
    .sort((a, b) => Math.abs(b.featureImpact) - Math.abs(a.featureImpact))
    .slice(0, 5)
    .map((feature) => ({
      feature: feature.featureName,
      impact: Number(feature.featureImpact.toFixed(6)),
      reasonCode: feature.reasonCode,
      detail: feature.detail
    }));

  const sourcePayload = JSON.stringify({
    job: input.job,
    jobPersona: input.jobPersona,
    veteran: {
      id: input.veteran.id,
      locationState: input.veteran.locationState,
      preferredWorkModes: input.veteran.preferredWorkModes,
      yearsOfService: input.veteran.yearsOfService,
      clearanceLevel: input.veteran.clearanceLevel,
      salaryExpectationMin: input.veteran.salaryExpectationMin,
      salaryExpectationMax: input.veteran.salaryExpectationMax,
      keySkills: input.veteran.keySkills,
      desiredRoles: input.veteran.desiredRoles
    },
    veteranPersona: input.veteranPersona
  });

  return {
    score,
    semanticScore,
    ruleScore,
    explanation,
    explanationBullets,
    explanationData: {
      formulaVersion: `${scoringConfig.algorithmFamily}-formula`,
      scoringConfigVersion: scoringConfig.version,
      semanticMode,
      embeddingModelVersion: semanticEmbeddingModelVersion,
      embeddingSimilarity,
      structuredSemanticScore: Number(structuredSemanticScore.toFixed(6)),
      componentScores: Object.fromEntries(
        Object.entries(componentScores).map(([key, value]) => [key, Number(value.toFixed(6))])
      ),
      weights,
      topContributors
    },
    features,
    sourceSnapshotHash: createHash("sha256").update(sourcePayload).digest("hex")
  };
}

export function buildMatchRunFingerprint(input: {
  jobId: string;
  jobSnapshotHash: string;
  candidateIds: string[];
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        jobId: input.jobId,
        jobSnapshotHash: input.jobSnapshotHash,
        candidateIds: [...input.candidateIds].sort()
      })
    )
    .digest("hex");
}
