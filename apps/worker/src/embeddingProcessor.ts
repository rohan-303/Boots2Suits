import { and, eq } from "drizzle-orm";
import { createDbClient, jobPersonas, veteranPersonas } from "@boots2suits/db";
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
}) {
  return [
    `Summary: ${persona.summary}`,
    `Strengths: ${joinIfArray(persona.strengths)}`,
    `Role clusters: ${joinIfArray(persona.roleClusters)}`,
    `Experience level: ${persona.experienceLevel ?? "unknown"}`,
    `Leadership profile: ${persona.leadershipProfile ?? "n/a"}`,
    `Technical profile: ${persona.technicalProfile ?? "n/a"}`,
    `Suggested job titles: ${joinIfArray(persona.suggestedJobTitles)}`
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
    `Role family: ${persona.suggestedRoleFamily ?? "unknown"}`
  ]
    .filter(Boolean)
    .join("\n");
}

export async function processEmbeddingGenerationJob(
  db: Db,
  provider: EmbeddingsProvider,
  payload: EmbeddingPayload
) {
  if (payload.targetType === "veteran_persona") {
    const [persona] = await db
      .select({
        id: veteranPersonas.id,
        summary: veteranPersonas.summary,
        strengths: veteranPersonas.strengths,
        roleClusters: veteranPersonas.roleClusters,
        experienceLevel: veteranPersonas.experienceLevel,
        leadershipProfile: veteranPersonas.leadershipProfile,
        technicalProfile: veteranPersonas.technicalProfile,
        suggestedJobTitles: veteranPersonas.suggestedJobTitles,
        sourceSnapshotHash: veteranPersonas.sourceSnapshotHash,
        embeddingModelVersion: veteranPersonas.embeddingModelVersion,
        embedding: veteranPersonas.embedding
      })
      .from(veteranPersonas)
      .where(eq(veteranPersonas.id, payload.targetId))
      .limit(1);

    if (!persona || persona.sourceSnapshotHash !== payload.sourceSnapshotHash) {
      return;
    }

    const hasEmbedding = Array.isArray(persona.embedding) && persona.embedding.length > 0;
    if (hasEmbedding && persona.embeddingModelVersion === provider.modelVersion) {
      return;
    }

    const text = buildVeteranPersonaEmbeddingText(persona);
    const vector = await provider.generateEmbedding(text);

    await db
      .update(veteranPersonas)
      .set({
        embedding: vector,
        embeddingModelVersion: provider.modelVersion,
        embeddedAt: new Date()
      })
      .where(
        and(
          eq(veteranPersonas.id, payload.targetId),
          eq(veteranPersonas.sourceSnapshotHash, payload.sourceSnapshotHash)
        )
      );
    return;
  }

  const [persona] = await db
    .select({
      id: jobPersonas.id,
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
      embedding: jobPersonas.embedding
    })
    .from(jobPersonas)
    .where(eq(jobPersonas.id, payload.targetId))
    .limit(1);

  if (!persona || persona.sourceSnapshotHash !== payload.sourceSnapshotHash) {
    return;
  }

  const hasEmbedding = Array.isArray(persona.embedding) && persona.embedding.length > 0;
  if (hasEmbedding && persona.embeddingModelVersion === provider.modelVersion) {
    return;
  }

  const text = buildJobPersonaEmbeddingText(persona);
  const vector = await provider.generateEmbedding(text);

  await db
    .update(jobPersonas)
    .set({
      embedding: vector,
      embeddingModelVersion: provider.modelVersion,
      embeddedAt: new Date()
    })
    .where(
      and(eq(jobPersonas.id, payload.targetId), eq(jobPersonas.sourceSnapshotHash, payload.sourceSnapshotHash))
    );
}
