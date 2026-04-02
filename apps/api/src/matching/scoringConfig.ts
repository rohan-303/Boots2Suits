import { z } from "zod";

export const matchFeatureKeys = [
  "skillSimilarity",
  "personaFit",
  "leadershipFit",
  "experienceFit",
  "locationFit",
  "clearanceFit",
  "compensationFit"
] as const;

export type MatchFeatureKey = (typeof matchFeatureKeys)[number];

export type MatchingScoringConfig = {
  version: string;
  algorithmFamily: string;
  explanationVersion: string;
  embeddingModelVersion: string;
  rerankerVersion: string;
  calibrationVersion: string;
  hybridWeights: {
    semantic: number;
    rule: number;
  };
  semanticBlendWeights: {
    embedding: number;
    structured: number;
  };
  weights: Record<MatchFeatureKey, number>;
};

const hybridWeightsSchema = z.object({
  semantic: z.number().min(0).max(1),
  rule: z.number().min(0).max(1)
});

const semanticBlendWeightsSchema = z.object({
  embedding: z.number().min(0).max(1),
  structured: z.number().min(0).max(1)
});

const weightSchema = z.object({
  skillSimilarity: z.number().min(0).max(1),
  personaFit: z.number().min(0).max(1),
  leadershipFit: z.number().min(0).max(1),
  experienceFit: z.number().min(0).max(1),
  locationFit: z.number().min(0).max(1),
  clearanceFit: z.number().min(0).max(1),
  compensationFit: z.number().min(0).max(1)
});

const configSchema = z.object({
  version: z.string().min(1),
  algorithmFamily: z.string().min(1),
  explanationVersion: z.string().min(1),
  embeddingModelVersion: z.string().min(1),
  rerankerVersion: z.string().min(1),
  calibrationVersion: z.string().min(1),
  hybridWeights: hybridWeightsSchema,
  semanticBlendWeights: semanticBlendWeightsSchema,
  weights: weightSchema
});

export const defaultScoringConfig: MatchingScoringConfig = {
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
};

export function validateScoringConfig(config: unknown): MatchingScoringConfig {
  const parsed = configSchema.parse(config);
  const totalWeight = Object.values(parsed.weights).reduce((sum, value) => sum + value, 0);
  if (Math.abs(totalWeight - 1) > 0.0001) {
    throw new Error(
      `Invalid scoring config: weights must sum to 1.0, received ${totalWeight.toFixed(6)}`
    );
  }
  const hybridTotal = parsed.hybridWeights.semantic + parsed.hybridWeights.rule;
  if (Math.abs(hybridTotal - 1) > 0.0001) {
    throw new Error(
      `Invalid scoring config: hybridWeights must sum to 1.0, received ${hybridTotal.toFixed(6)}`
    );
  }
  const semanticBlendTotal = parsed.semanticBlendWeights.embedding + parsed.semanticBlendWeights.structured;
  if (Math.abs(semanticBlendTotal - 1) > 0.0001) {
    throw new Error(
      `Invalid scoring config: semanticBlendWeights must sum to 1.0, received ${semanticBlendTotal.toFixed(6)}`
    );
  }
  return parsed;
}

export function mergeScoringConfig(
  base: MatchingScoringConfig,
  overrides?: Partial<MatchingScoringConfig>
): MatchingScoringConfig {
  if (!overrides) return base;
  return validateScoringConfig({
    ...base,
    ...overrides,
    weights: {
      ...base.weights,
      ...(overrides.weights ?? {})
    }
  });
}
