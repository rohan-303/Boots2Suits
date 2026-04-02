import { z } from "zod";
import type { MatchInput } from "../engine.js";

const veteranInputSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  veteran: z.custom<MatchInput["veteran"]>(),
  veteranPersona: z.custom<MatchInput["veteranPersona"]>().nullable(),
  embeddingSimilarity: z.number().min(0).max(1).optional()
});

export const evaluationCaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  job: z.custom<MatchInput["job"]>(),
  jobPersona: z.custom<MatchInput["jobPersona"]>().nullable(),
  candidates: z.array(veteranInputSchema).min(2),
  expectations: z.object({
    expectedTopCandidateId: z.string().min(1),
    expectedTop3CandidateIds: z.array(z.string()).optional(),
    expectedOrder: z.array(z.string()).optional(),
    expectedReasonCodesByCandidate: z.record(z.array(z.string())).optional()
  })
});

export const evaluationDatasetSchema = z.object({
  version: z.string().min(1),
  description: z.string().min(1),
  cases: z.array(evaluationCaseSchema).min(1)
});

export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;
export type EvaluationDataset = z.infer<typeof evaluationDatasetSchema>;
