import { createHash } from "node:crypto";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { NonRetryableJobError, isRetryableErrorType, normalizeError } from "@boots2suits/shared";
import {
  candidateJobScoreFeatures,
  candidateJobScores,
  createDbClient,
  jobPersonas,
  jobs,
  matchRuns,
  veteranPersonas,
  veteranProfiles
} from "@boots2suits/db";

type Db = ReturnType<typeof createDbClient>["db"];

type SemanticMode = "real_embeddings" | "structured_fallback" | "rule_only_fallback";

type MatchFeature = {
  featureName: string;
  featureWeight: number;
  featureValue: number;
  featureImpact: number;
  reasonCode: string;
  detail: string;
};

const scoringConfig = {
  version: "score-v1",
  algorithmFamily: "hybrid-rule",
  explanationVersion: "explain-v2",
  embeddingModelVersion: "structured-fallback-v1",
  rerankerVersion: "none",
  calibrationVersion: "none",
  hybridWeights: {
    semantic: 0.6,
    rule: 0.4
  },
  semanticBlendWeights: {
    embedding: 0.8,
    structured: 0.2
  },
  weights: {
    skillSimilarity: 0.35,
    personaFit: 0.2,
    leadershipFit: 0.1,
    experienceFit: 0.1,
    locationFit: 0.1,
    clearanceFit: 0.1,
    compensationFit: 0.05
  }
} as const;

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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function toKeywords(values: string[]) {
  const keywords = new Set<string>();
  for (const value of values) {
    const parts = normalizeText(value)
      .split(/[^a-z0-9]+/g)
      .filter((part) => part.length > 2 && !STOPWORDS.has(part));
    for (const part of parts) keywords.add(part);
  }
  return keywords;
}

function overlapScore(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const item of left) if (right.has(item)) overlap += 1;
  return overlap / right.size;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function parseVector(value: unknown): number[] | null {
  if (Array.isArray(value)) {
    const parsed = value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
    return parsed.length > 0 ? parsed : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const payload = trimmed.startsWith("[") ? trimmed : `[${trimmed}]`;
    try {
      const parsed = JSON.parse(payload);
      if (!Array.isArray(parsed)) return null;
      const vector = parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item));
      return vector.length > 0 ? vector : null;
    } catch {
      return null;
    }
  }
  return null;
}

function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) return null;
  let dot = 0;
  let normLeft = 0;
  let normRight = 0;
  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i];
    normLeft += left[i] ** 2;
    normRight += right[i] ** 2;
  }
  if (normLeft === 0 || normRight === 0) return null;
  const cosine = dot / (Math.sqrt(normLeft) * Math.sqrt(normRight));
  return clamp01((cosine + 1) / 2);
}

function parseClearanceLevel(value: string | null) {
  if (!value) return 0;
  const index = CLEARANCE_ORDER.indexOf(normalizeText(value));
  return index === -1 ? 0 : index;
}

function inferVeteranLeadershipLevel(input: {
  highestRank: string | null;
  yearsOfService: number | null;
  leadershipExperience: string | null;
  leadershipProfile: string | null;
}) {
  const rank = normalizeText(input.highestRank ?? "");
  const text = normalizeText(`${input.leadershipExperience ?? ""} ${input.leadershipProfile ?? ""}`);
  const highSignals =
    rank.includes("major") ||
    rank.includes("colonel") ||
    rank.includes("commander") ||
    rank.includes("captain") ||
    text.includes("command") ||
    text.includes("managed");
  if (highSignals || (input.yearsOfService ?? 0) >= 12) return "high";
  if ((input.yearsOfService ?? 0) >= 6 || text.includes("led")) return "medium";
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

function detailForFeature(feature: string, score: number) {
  if (feature === "skillSimilarity")
    return score >= 0.8
      ? "Strong must-have skill overlap with job requirements."
      : score >= 0.55
      ? "Partial overlap on required and preferred skills."
      : "Limited overlap on required skills.";
  if (feature === "personaFit")
    return score >= 0.8
      ? "Role clusters align closely with job archetype and role family."
      : score >= 0.55
      ? "Some role-cluster alignment with job persona."
      : "Role-cluster alignment with job persona is weak.";
  if (feature === "embeddingSemanticSimilarity")
    return score >= 0.8
      ? "Semantic embedding similarity is strong."
      : score >= 0.55
      ? "Semantic embedding similarity is moderate."
      : "Semantic embedding similarity is weak.";
  if (feature === "leadershipFit")
    return score >= 0.8
      ? "Leadership profile aligns with role expectations."
      : score >= 0.55
      ? "Leadership alignment is acceptable but not ideal."
      : "Leadership expectations may exceed candidate profile.";
  if (feature === "experienceFit")
    return score >= 0.8
      ? "Experience level meets or exceeds role expectations."
      : score >= 0.55
      ? "Experience is close to role expectations."
      : "Experience appears below role expectations.";
  if (feature === "locationFit")
    return score >= 0.8
      ? "Work mode and location preference align well."
      : score >= 0.55
      ? "Location fit is workable with some compromise."
      : "Location/work mode fit is weak.";
  if (feature === "clearanceFit")
    return score >= 0.8
      ? "Clearance requirement is satisfied."
      : score >= 0.55
      ? "Clearance fit is partial."
      : "Clearance requirement is not satisfied.";
  return score >= 0.8
    ? "Compensation expectations align."
    : score >= 0.55
    ? "Compensation alignment is plausible."
    : "Compensation expectations may not align.";
}

function buildMatchRunFingerprint(input: { jobId: string; jobSnapshotHash: string; candidateIds: string[] }) {
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

export async function processMatchingRun(
  db: Db,
  payload: { matchRunId: string; jobId: string },
  context: { attemptNumber: number; maxAttempts: number; startedAt: number },
  options?: {
    semanticWeight?: number;
    ruleWeight?: number;
    embeddingBlendWeight?: number;
    structuredBlendWeight?: number;
  }
) {
  const [runRow] = await db
    .select({
      id: matchRuns.id,
      status: matchRuns.status,
      attempts: matchRuns.attempts
    })
    .from(matchRuns)
    .where(eq(matchRuns.id, payload.matchRunId))
    .limit(1);
  if (!runRow) {
    throw new NonRetryableJobError("Matching run not found.", "VALIDATION_ERROR");
  }

  if (runRow.status === "completed") {
    return;
  }
  const nextAttempt = (runRow.attempts ?? 0) + 1;

  const appliedScoringConfig = {
    ...scoringConfig,
    hybridWeights: {
      semantic: options?.semanticWeight ?? scoringConfig.hybridWeights.semantic,
      rule: options?.ruleWeight ?? scoringConfig.hybridWeights.rule
    },
    semanticBlendWeights: {
      embedding: options?.embeddingBlendWeight ?? scoringConfig.semanticBlendWeights.embedding,
      structured: options?.structuredBlendWeight ?? scoringConfig.semanticBlendWeights.structured
    }
  };

  await db
    .update(matchRuns)
    .set({
      status: "running",
      startedAt: new Date(),
      failedAt: null,
      completedAt: null,
      errorMessage: null,
      errorType: null,
      errorStack: null,
      attempts: nextAttempt,
      retryCount: Math.max(0, nextAttempt - 1),
      lastRetriedAt: nextAttempt > 1 ? new Date() : null
    })
    .where(eq(matchRuns.id, payload.matchRunId));

  try {
    const [jobRow] = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        department: jobs.department,
        locationType: jobs.locationType,
        locationState: jobs.locationState,
        compensationMin: jobs.compensationMin,
        compensationMax: jobs.compensationMax,
        mustHaveSkills: jobs.mustHaveSkills,
        niceToHaveSkills: jobs.niceToHaveSkills,
        requiredExperienceLevel: jobs.requiredExperienceLevel,
        clearanceRequirement: jobs.clearanceRequirement
      })
      .from(jobs)
      .where(eq(jobs.id, payload.jobId))
      .limit(1);
    if (!jobRow) {
      throw new NonRetryableJobError("Matching worker: job not found.", "VALIDATION_ERROR");
    }

    const [jobPersona] = await db
      .select({
        suggestedRoleFamily: jobPersonas.suggestedRoleFamily,
        leadershipLevel: jobPersonas.leadershipLevel,
        suggestedCandidateArchetypes: jobPersonas.suggestedCandidateArchetypes,
        embedding: jobPersonas.embedding,
        embeddingModelVersion: jobPersonas.embeddingModelVersion
      })
      .from(jobPersonas)
      .where(and(eq(jobPersonas.jobId, payload.jobId), eq(jobPersonas.scope, "overall")))
      .limit(1);
    const jobEmbedding = parseVector(jobPersona?.embedding);

    const veterans = await db
      .select({
        id: veteranProfiles.id,
        locationState: veteranProfiles.locationState,
        preferredWorkModes: veteranProfiles.preferredWorkModes,
        yearsOfService: veteranProfiles.yearsOfService,
        clearanceLevel: veteranProfiles.clearanceLevel,
        salaryExpectationMin: veteranProfiles.salaryExpectationMin,
        salaryExpectationMax: veteranProfiles.salaryExpectationMax,
        keySkills: veteranProfiles.keySkills,
        desiredRoles: veteranProfiles.desiredRoles,
        highestRank: veteranProfiles.highestRank,
        leadershipExperience: veteranProfiles.leadershipExperience
      })
      .from(veteranProfiles)
      .where(isNotNull(veteranProfiles.profileCompletedAt));

    if (veterans.length === 0) {
      await db
        .update(matchRuns)
        .set({
          status: "failed",
          failedAt: new Date(),
          errorMessage: "No eligible veterans available for matching.",
          errorType: "VALIDATION_ERROR",
          errorStack: null,
          attempts: nextAttempt,
          retryCount: Math.max(0, nextAttempt - 1),
          durationMs: Date.now() - context.startedAt
        })
        .where(eq(matchRuns.id, payload.matchRunId));
      return;
    }

    const personas = await db
      .select({
        veteranProfileId: veteranPersonas.veteranProfileId,
        roleClusters: veteranPersonas.roleClusters,
        suggestedJobTitles: veteranPersonas.suggestedJobTitles,
        leadershipProfile: veteranPersonas.leadershipProfile,
        experienceLevel: veteranPersonas.experienceLevel,
        embedding: veteranPersonas.embedding,
        embeddingModelVersion: veteranPersonas.embeddingModelVersion
      })
      .from(veteranPersonas)
      .where(
        and(
          inArray(
            veteranPersonas.veteranProfileId,
            veterans.map((veteran) => veteran.id)
          ),
          eq(veteranPersonas.scope, "overall")
        )
      );
    const personaByVeteranId = new Map(personas.map((persona) => [persona.veteranProfileId, persona]));

    const semanticWeight =
      appliedScoringConfig.weights.skillSimilarity + appliedScoringConfig.weights.personaFit;
    const ruleWeight =
      appliedScoringConfig.weights.leadershipFit +
      appliedScoringConfig.weights.experienceFit +
      appliedScoringConfig.weights.locationFit +
      appliedScoringConfig.weights.clearanceFit +
      appliedScoringConfig.weights.compensationFit;

    const scored = veterans.map((veteran) => {
      const persona = personaByVeteranId.get(veteran.id);
      const mustSkills = toKeywords(asStringArray(jobRow.mustHaveSkills));
      const niceSkills = toKeywords(asStringArray(jobRow.niceToHaveSkills));
      const veteranSkills = toKeywords(asStringArray(veteran.keySkills));
      const mustScore = mustSkills.size > 0 ? overlapScore(veteranSkills, mustSkills) : 0.6;
      const niceScore = niceSkills.size > 0 ? overlapScore(veteranSkills, niceSkills) : 0.5;
      const skillSimilarity = clamp01(mustScore * 0.75 + niceScore * 0.25);

      const veteranRoleSignals = toKeywords([
        ...asStringArray(veteran.desiredRoles),
        ...asStringArray(persona?.roleClusters),
        ...asStringArray(persona?.suggestedJobTitles)
      ]);
      const jobRoleSignals = toKeywords([
        jobRow.title,
        jobRow.department ?? "",
        jobPersona?.suggestedRoleFamily ?? "",
        ...asStringArray(jobPersona?.suggestedCandidateArchetypes)
      ]);
      const personaFit = clamp01(overlapScore(veteranRoleSignals, jobRoleSignals));

      const structuredSemanticScore = clamp01(
        (skillSimilarity * appliedScoringConfig.weights.skillSimilarity +
          personaFit * appliedScoringConfig.weights.personaFit) /
          semanticWeight
      );
      const semanticKeywordOverlap = [...veteranSkills].filter((item) => mustSkills.has(item)).slice(0, 8);

      const candidateEmbedding = parseVector(persona?.embedding);
      const embeddingSimilarity =
        jobEmbedding && candidateEmbedding ? cosineSimilarity(jobEmbedding, candidateEmbedding) : null;
      const semanticMode: SemanticMode = embeddingSimilarity !== null ? "real_embeddings" : "rule_only_fallback";
      const semanticScore =
        embeddingSimilarity !== null
          ? clamp01(
              embeddingSimilarity * appliedScoringConfig.semanticBlendWeights.embedding +
                structuredSemanticScore * appliedScoringConfig.semanticBlendWeights.structured
            )
          : 0;
      const semanticEmbeddingModelVersion =
        semanticMode === "real_embeddings"
          ? candidateEmbedding &&
            jobEmbedding &&
            persona?.embeddingModelVersion === jobPersona?.embeddingModelVersion
            ? (persona.embeddingModelVersion ?? "unknown-embedding-model")
            : (persona?.embeddingModelVersion ??
              jobPersona?.embeddingModelVersion ??
              "unknown-embedding-model")
          : "structured-fallback-v1";

      const veteranLeadership = inferVeteranLeadershipLevel({
        highestRank: veteran.highestRank,
        yearsOfService: veteran.yearsOfService,
        leadershipExperience: veteran.leadershipExperience,
        leadershipProfile: persona?.leadershipProfile ?? null
      });
      const expectedLeadership = normalizeText(jobPersona?.leadershipLevel ?? "individual_contributor");
      const leadershipFit =
        veteranLeadership === expectedLeadership
          ? 1
          : veteranLeadership === "high" && expectedLeadership === "medium"
          ? 0.8
          : veteranLeadership === "medium" && expectedLeadership === "individual_contributor"
          ? 0.8
          : 0.35;

      const inferredYears = inferYearsFromPersonaLevel(persona?.experienceLevel ?? null);
      const years = veteran.yearsOfService ?? inferredYears ?? 0;
      const requiredYears = requiredYearsForExperienceLevel(jobRow.requiredExperienceLevel);
      const experienceFit = years - requiredYears >= 0 ? 1 : years - requiredYears >= -2 ? 0.65 : 0.3;

      const preferredModes = new Set(asStringArray(veteran.preferredWorkModes).map(normalizeText));
      const jobMode = normalizeText(jobRow.locationType);
      const modeFit = preferredModes.has(jobMode) ? 1 : jobMode === "remote" ? 0.7 : 0.35;
      const stateFit =
        jobRow.locationState && veteran.locationState
          ? normalizeText(jobRow.locationState) === normalizeText(veteran.locationState)
            ? 1
            : 0.4
          : 0.7;
      const locationFit = clamp01(modeFit * 0.8 + stateFit * 0.2);

      const requiredClearance = parseClearanceLevel(jobRow.clearanceRequirement);
      const veteranClearance = parseClearanceLevel(veteran.clearanceLevel);
      const clearanceFit = requiredClearance === 0 ? 1 : veteranClearance >= requiredClearance ? 1 : 0;

      let compensationFit = 0.5;
      if (
        jobRow.compensationMin !== null &&
        jobRow.compensationMax !== null &&
        veteran.salaryExpectationMin !== null &&
        veteran.salaryExpectationMax !== null
      ) {
        const overlapMin = Math.max(jobRow.compensationMin, veteran.salaryExpectationMin);
        const overlapMax = Math.min(jobRow.compensationMax, veteran.salaryExpectationMax);
        compensationFit =
          overlapMin <= overlapMax ? 1 : Math.abs(overlapMin - overlapMax) <= 10000 ? 0.6 : 0.2;
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

      const ruleScore = clamp01(
        (leadershipFit * appliedScoringConfig.weights.leadershipFit +
          experienceFit * appliedScoringConfig.weights.experienceFit +
          locationFit * appliedScoringConfig.weights.locationFit +
          clearanceFit * appliedScoringConfig.weights.clearanceFit +
          compensationFit * appliedScoringConfig.weights.compensationFit) /
          ruleWeight
      );

      const score =
        semanticMode === "rule_only_fallback"
          ? ruleScore
          : clamp01(
              semanticScore * appliedScoringConfig.hybridWeights.semantic +
                ruleScore * appliedScoringConfig.hybridWeights.rule
            );

      const features: MatchFeature[] = (
        Object.entries(componentScores) as Array<[keyof typeof componentScores, number]>
      )
        .map(([featureName, featureValue]) => {
          const featureWeight = appliedScoringConfig.weights[featureName];
          return {
            featureName,
            featureWeight,
            featureValue,
            featureImpact: (featureValue - 0.5) * 2 * featureWeight,
            reasonCode: reasonCode(featureName, featureValue),
            detail: detailForFeature(featureName, featureValue)
          };
        })
        .sort((a, b) => Math.abs(b.featureImpact) - Math.abs(a.featureImpact));

      if (embeddingSimilarity !== null) {
        const embeddingFeatureWeight = semanticWeight;
        const featureImpact = (embeddingSimilarity - 0.5) * 2 * embeddingFeatureWeight;
        features.push({
          featureName: "embeddingSemanticSimilarity",
          featureWeight: embeddingFeatureWeight,
          featureValue: embeddingSimilarity,
          featureImpact,
          reasonCode: reasonCode("embedding_semantic_similarity", embeddingSimilarity),
          detail: detailForFeature("embeddingSemanticSimilarity", embeddingSimilarity)
        });
        features.sort((a, b) => Math.abs(b.featureImpact) - Math.abs(a.featureImpact));
      }
      if (semanticKeywordOverlap.length > 0) {
        const overlapRatio = semanticKeywordOverlap.length / Math.max(1, mustSkills.size);
        const impact = (overlapRatio - 0.5) * 2 * appliedScoringConfig.hybridWeights.semantic;
        features.push({
          featureName: "semanticKeywordOverlap",
          featureWeight: appliedScoringConfig.hybridWeights.semantic,
          featureValue: overlapRatio,
          featureImpact: impact,
          reasonCode: "semantic_terms_overlap",
          detail: `Semantic overlap terms: ${semanticKeywordOverlap.join(", ")}.`
        });
        features.sort((a, b) => Math.abs(b.featureImpact) - Math.abs(a.featureImpact));
      }

      const explanationBullets = features.slice(0, 3).map((feature) => feature.detail);
      const explanation = explanationBullets.join(" ");

      const explanationData = {
        formulaVersion: `${appliedScoringConfig.algorithmFamily}-formula`,
        scoringConfigVersion: appliedScoringConfig.version,
        semanticMode,
        embeddingModelVersion: semanticEmbeddingModelVersion,
        embeddingSimilarity:
          embeddingSimilarity !== null ? Number(embeddingSimilarity.toFixed(6)) : null,
        structuredSemanticScore: Number(structuredSemanticScore.toFixed(6)),
        semanticKeywordOverlap,
        componentScores,
        weights: {
          ...appliedScoringConfig.weights,
          hybridSemanticWeight: appliedScoringConfig.hybridWeights.semantic,
          hybridRuleWeight: appliedScoringConfig.hybridWeights.rule,
          semanticEmbeddingBlendWeight: appliedScoringConfig.semanticBlendWeights.embedding,
          semanticStructuredBlendWeight: appliedScoringConfig.semanticBlendWeights.structured
        },
        topContributors: features.slice(0, 5).map((feature) => ({
          feature: feature.featureName,
          impact: Number(feature.featureImpact.toFixed(6)),
          reasonCode: feature.reasonCode,
          detail: feature.detail
        }))
      };

      const sourceSnapshotHash = createHash("sha256")
        .update(
          JSON.stringify({
            job: jobRow,
            jobPersona,
            veteran,
            veteranPersona: persona,
            semanticMode,
            semanticEmbeddingModelVersion
          })
        )
        .digest("hex");

      return {
        veteranProfileId: veteran.id,
        semanticMode,
        semanticEmbeddingModelVersion,
        match: {
          score,
          semanticScore,
          ruleScore,
          explanation,
          explanationData,
          features,
          sourceSnapshotHash
        }
      };
    });

    const runSnapshotHash = scored.map((record) => record.match.sourceSnapshotHash).sort().join(":");
    const inputFingerprint = buildMatchRunFingerprint({
      jobId: payload.jobId,
      jobSnapshotHash: runSnapshotHash,
      candidateIds: veterans.map((veteran) => veteran.id)
    });

    const ranked = [...scored].sort((left, right) => right.match.score - left.match.score);
    await db.delete(candidateJobScores).where(eq(candidateJobScores.matchRunId, payload.matchRunId));

    const runEmbeddingModelVersion =
      ranked.find((record) => record.semanticMode === "real_embeddings")?.semanticEmbeddingModelVersion ??
      "structured-fallback-v1";

    const scoreRows = ranked.map((item, idx) => ({
      veteranProfileId: item.veteranProfileId,
      jobId: payload.jobId,
      matchRunId: payload.matchRunId,
      algorithmVersion: appliedScoringConfig.algorithmFamily,
      embeddingModelVersion: item.semanticEmbeddingModelVersion,
      rerankerVersion: appliedScoringConfig.rerankerVersion,
      calibrationVersion: appliedScoringConfig.calibrationVersion,
      scoreVersion: appliedScoringConfig.version,
      explanationVersion: appliedScoringConfig.explanationVersion,
      inputFingerprint,
      sourceSnapshotHash: item.match.sourceSnapshotHash,
      score: item.match.score.toFixed(6),
      semanticScore: item.match.semanticScore.toFixed(6),
      ruleScore: item.match.ruleScore.toFixed(6),
      explanation: item.match.explanation,
      explanationData: item.match.explanationData,
      rank: idx + 1
    }));

    const createdScores = await db
      .insert(candidateJobScores)
      .values(scoreRows)
      .returning({
        id: candidateJobScores.id,
        veteranProfileId: candidateJobScores.veteranProfileId
      });
    const scoreIdByVeteran = new Map(createdScores.map((row) => [row.veteranProfileId, row.id]));

    const featureRows = ranked.flatMap((item) => {
      const scoreId = scoreIdByVeteran.get(item.veteranProfileId);
      if (!scoreId) return [];
      const sortedFeatures = [...item.match.features].sort(
        (left, right) => Math.abs(right.featureImpact) - Math.abs(left.featureImpact)
      );
      return sortedFeatures.map((feature, index) => ({
        candidateJobScoreId: scoreId,
        featureName: feature.featureName,
        featureWeight: feature.featureWeight.toFixed(6),
        featureValue: feature.featureValue.toFixed(4),
        featureImpact: feature.featureImpact.toFixed(6),
        reasonCode: feature.reasonCode,
        displayOrder: index
      }));
    });
    if (featureRows.length > 0) {
      await db.insert(candidateJobScoreFeatures).values(featureRows);
    }

    await db
      .update(matchRuns)
      .set({
        status: "completed",
        embeddingModelVersion: runEmbeddingModelVersion,
        inputFingerprint,
        sourceSnapshotHash: runSnapshotHash,
        completedAt: new Date(),
        errorMessage: null,
        errorType: null,
        errorStack: null,
        attempts: nextAttempt,
        retryCount: Math.max(0, nextAttempt - 1),
        durationMs: Date.now() - context.startedAt
      })
      .where(eq(matchRuns.id, payload.matchRunId));
  } catch (error) {
    const normalized = normalizeError(error);
    const retryable = isRetryableErrorType(normalized.errorType);
    const isFinalAttempt = !retryable || context.attemptNumber >= context.maxAttempts;
    const failedAt = new Date();
    const failureUpdate: {
      status: "failed" | "queued";
      failedAt: Date;
      errorMessage: string;
      errorType: string;
      errorStack: string | null;
      attempts: number;
      retryCount: number;
      lastRetriedAt: Date | null;
      durationMs: number;
      queuedAt?: Date;
    } = {
      status: isFinalAttempt ? "failed" : "queued",
      failedAt,
      errorMessage: normalized.errorMessage,
      errorType: normalized.errorType,
      errorStack: normalized.errorStack,
      attempts: nextAttempt,
      retryCount: Math.max(0, nextAttempt - 1),
      lastRetriedAt: nextAttempt > 1 ? new Date() : null,
      durationMs: Date.now() - context.startedAt
    };
    if (retryable && !isFinalAttempt) {
      failureUpdate.queuedAt = new Date();
    }
    await db
      .update(matchRuns)
      .set(failureUpdate)
      .where(eq(matchRuns.id, payload.matchRunId));
    if (!retryable) {
      throw new NonRetryableJobError(normalized.errorMessage, normalized.errorType);
    }
    throw error;
  }
}
