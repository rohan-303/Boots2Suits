import { createHash } from "node:crypto";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
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

const scoringConfig = {
  version: "score-v1",
  algorithmFamily: "hybrid-rule",
  explanationVersion: "explain-v1",
  embeddingModelVersion: "structured-placeholder-v1",
  rerankerVersion: "none",
  calibrationVersion: "none",
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
  for (const item of left) {
    if (right.has(item)) overlap += 1;
  }
  return overlap / right.size;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
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

export async function processMatchingRun(db: Db, payload: { matchRunId: string; jobId: string }) {
  await db
    .update(matchRuns)
    .set({
      status: "running",
      startedAt: new Date(),
      failedAt: null,
      completedAt: null,
      errorMessage: null
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
    if (!jobRow) throw new Error("Matching worker: job not found.");

    const [jobPersona] = await db
      .select({
        suggestedRoleFamily: jobPersonas.suggestedRoleFamily,
        leadershipLevel: jobPersonas.leadershipLevel,
        suggestedCandidateArchetypes: jobPersonas.suggestedCandidateArchetypes
      })
      .from(jobPersonas)
      .where(and(eq(jobPersonas.jobId, payload.jobId), eq(jobPersonas.scope, "overall")))
      .limit(1);

    const veterans = await db
      .select({
        id: veteranProfiles.id,
        userId: veteranProfiles.userId,
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
          errorMessage: "No eligible veterans available for matching."
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
        experienceLevel: veteranPersonas.experienceLevel
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

      const score = clamp01(
        Object.entries(componentScores).reduce(
          (sum, [key, value]) =>
            sum + value * scoringConfig.weights[key as keyof typeof scoringConfig.weights],
          0
        )
      );
      const semanticScore = clamp01(
        (skillSimilarity * scoringConfig.weights.skillSimilarity +
          personaFit * scoringConfig.weights.personaFit) /
          (scoringConfig.weights.skillSimilarity + scoringConfig.weights.personaFit)
      );
      const ruleScore = clamp01(
        (leadershipFit * scoringConfig.weights.leadershipFit +
          experienceFit * scoringConfig.weights.experienceFit +
          locationFit * scoringConfig.weights.locationFit +
          clearanceFit * scoringConfig.weights.clearanceFit +
          compensationFit * scoringConfig.weights.compensationFit) /
          (scoringConfig.weights.leadershipFit +
            scoringConfig.weights.experienceFit +
            scoringConfig.weights.locationFit +
            scoringConfig.weights.clearanceFit +
            scoringConfig.weights.compensationFit)
      );

      const features = (Object.entries(componentScores) as Array<[keyof typeof componentScores, number]>)
        .map(([featureName, featureValue]) => {
          const featureWeight = scoringConfig.weights[featureName];
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

      const explanation = features
        .slice(0, 3)
        .map((feature) => feature.detail)
        .join(" ");

      const explanationData = {
        formulaVersion: `${scoringConfig.algorithmFamily}-formula`,
        scoringConfigVersion: scoringConfig.version,
        componentScores,
        weights: scoringConfig.weights,
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
            veteran: {
              id: veteran.id,
              locationState: veteran.locationState,
              preferredWorkModes: veteran.preferredWorkModes,
              yearsOfService: veteran.yearsOfService,
              clearanceLevel: veteran.clearanceLevel,
              salaryExpectationMin: veteran.salaryExpectationMin,
              salaryExpectationMax: veteran.salaryExpectationMax,
              keySkills: veteran.keySkills,
              desiredRoles: veteran.desiredRoles
            },
            veteranPersona: persona
          })
        )
        .digest("hex");

      return {
        veteranProfileId: veteran.id,
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

    const scoreRows = ranked.map((item, idx) => ({
      veteranProfileId: item.veteranProfileId,
      jobId: payload.jobId,
      matchRunId: payload.matchRunId,
      algorithmVersion: scoringConfig.algorithmFamily,
      embeddingModelVersion: scoringConfig.embeddingModelVersion,
      rerankerVersion: scoringConfig.rerankerVersion,
      calibrationVersion: scoringConfig.calibrationVersion,
      scoreVersion: scoringConfig.version,
      explanationVersion: scoringConfig.explanationVersion,
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
        inputFingerprint,
        sourceSnapshotHash: runSnapshotHash,
        completedAt: new Date(),
        errorMessage: null
      })
      .where(eq(matchRuns.id, payload.matchRunId));
  } catch (error) {
    await db
      .update(matchRuns)
      .set({
        status: "failed",
        failedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Matching run failed."
      })
      .where(eq(matchRuns.id, payload.matchRunId));
    throw error;
  }
}
