import { and, eq } from "drizzle-orm";
import {
  createDbClient,
  jobs,
  jobPersonas,
  veteranOccupationHistory,
  veteranPersonas,
  veteranProfiles
} from "@boots2suits/db";
import { NonRetryableJobError, isRetryableErrorType, normalizeError } from "@boots2suits/shared";
import type { EmbeddingsProvider } from "./embeddings/provider.js";

type Db = ReturnType<typeof createDbClient>["db"];

type EmbeddingPayload = {
  targetType: "veteran_persona" | "job_persona";
  targetId: string;
  sourceSnapshotHash: string;
};

function joinIfArray(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => String(item).trim()).filter(Boolean).join(", ");
}

function buildVeteranPersonaEmbeddingText(persona: {
  summary: string;
  strengths: unknown;
  roleClusters: unknown;
  experienceLevel: string | null;
  leadershipProfile: string | null;
  technicalProfile: string | null;
  suggestedJobTitles: unknown;
  context?: {
    mosCode: string | null;
    mosTitle: string | null;
    highestRank: string | null;
    yearsOfService: number | null;
    desiredRoles: unknown;
    preferredIndustries: unknown;
    preferredWorkModes: unknown;
    occupationHistory: string[];
  };
}) {
  return [
    `Summary: ${persona.summary}`,
    `Strengths: ${joinIfArray(persona.strengths)}`,
    `Role clusters: ${joinIfArray(persona.roleClusters)}`,
    `Experience level: ${persona.experienceLevel ?? "unknown"}`,
    `Leadership profile: ${persona.leadershipProfile ?? "n/a"}`,
    `Technical profile: ${persona.technicalProfile ?? "n/a"}`,
    `Suggested job titles: ${joinIfArray(persona.suggestedJobTitles)}`,
    `MOS code: ${persona.context?.mosCode ?? "n/a"}`,
    `MOS title: ${persona.context?.mosTitle ?? "n/a"}`,
    `Highest rank: ${persona.context?.highestRank ?? "n/a"}`,
    `Years of service: ${persona.context?.yearsOfService ?? "n/a"}`,
    `Desired roles: ${joinIfArray(persona.context?.desiredRoles)}`,
    `Preferred industries: ${joinIfArray(persona.context?.preferredIndustries)}`,
    `Preferred work modes: ${joinIfArray(persona.context?.preferredWorkModes)}`,
    `Occupation history: ${persona.context?.occupationHistory.join(" | ") ?? "n/a"}`
  ]
    .filter(Boolean)
    .join("\n");
}

function buildJobPersonaEmbeddingText(persona: {
  summary: string;
  leadershipLevel: string | null;
  executionVsStrategy: string | null;
  environmentType: string | null;
  technicalDepth: string | null;
  suggestedCandidateArchetypes: unknown;
  prioritySignals: unknown;
  disqualifiers: unknown;
  suggestedRoleFamily: string | null;
  context?: {
    title: string | null;
    department: string | null;
    mustHaveSkills: unknown;
    niceToHaveSkills: unknown;
    requiredExperienceLevel: string | null;
    clearanceRequirement: string | null;
    locationType: string | null;
    locationState: string | null;
    compensationMin: number | null;
    compensationMax: number | null;
  };
}) {
  return [
    `Summary: ${persona.summary}`,
    `Leadership level: ${persona.leadershipLevel ?? "unknown"}`,
    `Execution vs strategy: ${persona.executionVsStrategy ?? "unknown"}`,
    `Environment type: ${persona.environmentType ?? "unknown"}`,
    `Technical depth: ${persona.technicalDepth ?? "unknown"}`,
    `Candidate archetypes: ${joinIfArray(persona.suggestedCandidateArchetypes)}`,
    `Priority signals: ${joinIfArray(persona.prioritySignals)}`,
    `Disqualifiers: ${joinIfArray(persona.disqualifiers)}`,
    `Role family: ${persona.suggestedRoleFamily ?? "unknown"}`,
    `Job title: ${persona.context?.title ?? "n/a"}`,
    `Department: ${persona.context?.department ?? "n/a"}`,
    `Must-have skills: ${joinIfArray(persona.context?.mustHaveSkills)}`,
    `Nice-to-have skills: ${joinIfArray(persona.context?.niceToHaveSkills)}`,
    `Required experience level: ${persona.context?.requiredExperienceLevel ?? "n/a"}`,
    `Clearance requirement: ${persona.context?.clearanceRequirement ?? "n/a"}`,
    `Location type/state: ${persona.context?.locationType ?? "n/a"} / ${persona.context?.locationState ?? "n/a"}`,
    `Compensation range: ${
      persona.context?.compensationMin !== null && persona.context?.compensationMin !== undefined
        ? persona.context.compensationMin
        : "n/a"
    } - ${
      persona.context?.compensationMax !== null && persona.context?.compensationMax !== undefined
        ? persona.context.compensationMax
        : "n/a"
    }`
  ]
    .filter(Boolean)
    .join("\n");
}

export async function processEmbeddingGenerationJob(
  db: Db,
  provider: EmbeddingsProvider,
  payload: EmbeddingPayload,
  context?: { attemptNumber: number; maxAttempts: number; startedAt: number }
) {
  const startedAt = new Date();

  if (payload.targetType === "veteran_persona") {
    const [persona] = await db
      .select({
        id: veteranPersonas.id,
        veteranProfileId: veteranPersonas.veteranProfileId,
        summary: veteranPersonas.summary,
        strengths: veteranPersonas.strengths,
        roleClusters: veteranPersonas.roleClusters,
        experienceLevel: veteranPersonas.experienceLevel,
        leadershipProfile: veteranPersonas.leadershipProfile,
        technicalProfile: veteranPersonas.technicalProfile,
        suggestedJobTitles: veteranPersonas.suggestedJobTitles,
        sourceSnapshotHash: veteranPersonas.sourceSnapshotHash,
        embeddingModelVersion: veteranPersonas.embeddingModelVersion,
      embedding: veteranPersonas.embedding,
      embeddingStatus: veteranPersonas.embeddingStatus,
      embeddingAttempts: veteranPersonas.embeddingAttempts
    })
      .from(veteranPersonas)
      .where(eq(veteranPersonas.id, payload.targetId))
      .limit(1);

    if (!persona || persona.sourceSnapshotHash !== payload.sourceSnapshotHash) {
      return;
    }
    const nextAttempt = (persona.embeddingAttempts ?? 0) + 1;

    const hasEmbedding = Array.isArray(persona.embedding) && persona.embedding.length > 0;
    if (
      hasEmbedding &&
      persona.embeddingModelVersion === provider.modelVersion &&
      persona.embeddingStatus === "completed"
    ) {
      return;
    }

    await db
      .update(veteranPersonas)
      .set({
        embeddingStatus: "processing",
        embeddingError: null,
        embeddingErrorType: null,
        embeddingStartedAt: startedAt,
        embeddingFailedAt: null,
        embeddingCompletedAt: null,
        embeddingAttempts: nextAttempt,
        embeddingRetryCount: Math.max(0, nextAttempt - 1),
        embeddingLastRetriedAt: nextAttempt > 1 ? new Date() : null
      })
      .where(eq(veteranPersonas.id, payload.targetId));

    const [profile] = await db
      .select({
        mosCode: veteranProfiles.mosCode,
        mosTitle: veteranProfiles.mosTitle,
        highestRank: veteranProfiles.highestRank,
        yearsOfService: veteranProfiles.yearsOfService,
        desiredRoles: veteranProfiles.desiredRoles,
        preferredIndustries: veteranProfiles.preferredIndustries,
        preferredWorkModes: veteranProfiles.preferredWorkModes
      })
      .from(veteranProfiles)
      .where(eq(veteranProfiles.id, persona.veteranProfileId))
      .limit(1);

    const historyRows = await db
      .select({
        mosCode: veteranOccupationHistory.mosCode,
        mosTitle: veteranOccupationHistory.mosTitle
      })
      .from(veteranOccupationHistory)
      .where(eq(veteranOccupationHistory.veteranProfileId, persona.veteranProfileId));

    try {
      const text = buildVeteranPersonaEmbeddingText({
        ...persona,
        context: {
          mosCode: profile?.mosCode ?? null,
          mosTitle: profile?.mosTitle ?? null,
          highestRank: profile?.highestRank ?? null,
          yearsOfService: profile?.yearsOfService ?? null,
          desiredRoles: profile?.desiredRoles ?? null,
          preferredIndustries: profile?.preferredIndustries ?? null,
          preferredWorkModes: profile?.preferredWorkModes ?? null,
          occupationHistory: historyRows.map((row) => `${row.mosCode} ${row.mosTitle}`)
        }
      });
      const vector = await provider.generateEmbedding(text);

      await db
        .update(veteranPersonas)
        .set({
          embedding: vector,
          embeddingModelVersion: provider.modelVersion,
          embeddingStatus: vector ? "completed" : "failed",
          embeddingError: vector ? null : "No embedding generated by provider.",
          embeddingErrorType: vector ? null : "EXTERNAL_DEPENDENCY_ERROR",
          embeddingFailedAt: vector ? null : new Date(),
          embeddingCompletedAt: vector ? new Date() : null,
          embeddingDurationMs: Date.now() - (context?.startedAt ?? Date.now()),
          embeddedAt: vector ? new Date() : null
        })
        .where(
          and(
            eq(veteranPersonas.id, payload.targetId),
            eq(veteranPersonas.sourceSnapshotHash, payload.sourceSnapshotHash)
          )
        );
    } catch (error) {
      const normalized = normalizeError(error);
      const retryable = isRetryableErrorType(normalized.errorType);
      const isFinalAttempt = !retryable || (context ? context.attemptNumber >= context.maxAttempts : true);
      await db
        .update(veteranPersonas)
        .set({
          embeddingStatus: isFinalAttempt ? "failed" : "pending",
          embeddingError: `${normalized.errorType}: ${normalized.errorMessage}`,
          embeddingErrorType: normalized.errorType,
          embeddingLastRetriedAt: nextAttempt > 1 ? new Date() : null,
          embeddingDurationMs: Date.now() - (context?.startedAt ?? Date.now()),
          embeddingFailedAt: new Date()
        })
        .where(eq(veteranPersonas.id, payload.targetId));
      if (!retryable) {
        throw new NonRetryableJobError(normalized.errorMessage, normalized.errorType);
      }
      throw error;
    }
    return;
  }

  const [persona] = await db
    .select({
      id: jobPersonas.id,
      jobId: jobPersonas.jobId,
      summary: jobPersonas.summary,
      leadershipLevel: jobPersonas.leadershipLevel,
      executionVsStrategy: jobPersonas.executionVsStrategy,
      environmentType: jobPersonas.environmentType,
      technicalDepth: jobPersonas.technicalDepth,
      suggestedCandidateArchetypes: jobPersonas.suggestedCandidateArchetypes,
      prioritySignals: jobPersonas.prioritySignals,
      disqualifiers: jobPersonas.disqualifiers,
      suggestedRoleFamily: jobPersonas.suggestedRoleFamily,
      sourceSnapshotHash: jobPersonas.sourceSnapshotHash,
      embeddingModelVersion: jobPersonas.embeddingModelVersion,
      embedding: jobPersonas.embedding,
      embeddingStatus: jobPersonas.embeddingStatus,
      embeddingAttempts: jobPersonas.embeddingAttempts
    })
    .from(jobPersonas)
    .where(eq(jobPersonas.id, payload.targetId))
    .limit(1);

  if (!persona || persona.sourceSnapshotHash !== payload.sourceSnapshotHash) {
    return;
  }
  const nextAttempt = (persona.embeddingAttempts ?? 0) + 1;

  const hasEmbedding = Array.isArray(persona.embedding) && persona.embedding.length > 0;
  if (
    hasEmbedding &&
    persona.embeddingModelVersion === provider.modelVersion &&
    persona.embeddingStatus === "completed"
  ) {
    return;
  }

  await db
    .update(jobPersonas)
    .set({
      embeddingStatus: "processing",
      embeddingError: null,
      embeddingErrorType: null,
      embeddingStartedAt: startedAt,
      embeddingFailedAt: null,
      embeddingCompletedAt: null,
      embeddingAttempts: nextAttempt,
      embeddingRetryCount: Math.max(0, nextAttempt - 1),
      embeddingLastRetriedAt: nextAttempt > 1 ? new Date() : null
    })
    .where(eq(jobPersonas.id, payload.targetId));

  const [jobContext] = await db
    .select({
      title: jobs.title,
      department: jobs.department,
      mustHaveSkills: jobs.mustHaveSkills,
      niceToHaveSkills: jobs.niceToHaveSkills,
      requiredExperienceLevel: jobs.requiredExperienceLevel,
      clearanceRequirement: jobs.clearanceRequirement,
      locationType: jobs.locationType,
      locationState: jobs.locationState,
      compensationMin: jobs.compensationMin,
      compensationMax: jobs.compensationMax
    })
    .from(jobs)
    .where(eq(jobs.id, persona.jobId))
    .limit(1);

  try {
    const text = buildJobPersonaEmbeddingText({
      ...persona,
      context: jobContext
        ? {
            title: jobContext.title,
            department: jobContext.department,
            mustHaveSkills: jobContext.mustHaveSkills,
            niceToHaveSkills: jobContext.niceToHaveSkills,
            requiredExperienceLevel: jobContext.requiredExperienceLevel,
            clearanceRequirement: jobContext.clearanceRequirement,
            locationType: jobContext.locationType,
            locationState: jobContext.locationState,
            compensationMin: jobContext.compensationMin,
            compensationMax: jobContext.compensationMax
          }
        : undefined
    });
    const vector = await provider.generateEmbedding(text);

    await db
      .update(jobPersonas)
      .set({
        embedding: vector,
        embeddingModelVersion: provider.modelVersion,
        embeddingStatus: vector ? "completed" : "failed",
        embeddingError: vector ? null : "No embedding generated by provider.",
        embeddingErrorType: vector ? null : "EXTERNAL_DEPENDENCY_ERROR",
        embeddingFailedAt: vector ? null : new Date(),
        embeddingCompletedAt: vector ? new Date() : null,
        embeddingDurationMs: Date.now() - (context?.startedAt ?? Date.now()),
        embeddedAt: vector ? new Date() : null
      })
      .where(
        and(eq(jobPersonas.id, payload.targetId), eq(jobPersonas.sourceSnapshotHash, payload.sourceSnapshotHash))
      );
  } catch (error) {
    const normalized = normalizeError(error);
    const retryable = isRetryableErrorType(normalized.errorType);
    const isFinalAttempt = !retryable || (context ? context.attemptNumber >= context.maxAttempts : true);
    await db
      .update(jobPersonas)
      .set({
        embeddingStatus: isFinalAttempt ? "failed" : "pending",
        embeddingError: `${normalized.errorType}: ${normalized.errorMessage}`,
        embeddingErrorType: normalized.errorType,
        embeddingLastRetriedAt: nextAttempt > 1 ? new Date() : null,
        embeddingDurationMs: Date.now() - (context?.startedAt ?? Date.now()),
        embeddingFailedAt: new Date()
      })
      .where(eq(jobPersonas.id, payload.targetId));
    if (!retryable) {
      throw new NonRetryableJobError(normalized.errorMessage, normalized.errorType);
    }
    throw error;
  }
}
