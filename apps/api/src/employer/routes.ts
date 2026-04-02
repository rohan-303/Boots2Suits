import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { apiLogger } from "@boots2suits/shared";
import {
  applicationEvents,
  applications,
  candidateJobScoreFeatures,
  candidateJobScores,
  companies,
  createDbClient,
  jobCandidateExportItems,
  jobCandidateExports,
  jobPersonas,
  jobs,
  militaryOccupations,
  users,
  veteranDocuments,
  veteranOccupationHistory,
  veteranPersonas,
  veteranProfiles
} from "@boots2suits/db";
import {
  createApplicationWithEvent,
  getLatestApplicationForPair,
  isActiveApplicationStatus,
  transitionApplicationStatus,
  type WorkflowApplicationStatus
} from "../applications/service.js";
import { buildAuthMiddleware, type AuthenticatedRequest } from "../auth/middleware.js";
import { env } from "../config/env.js";
import { enqueueEmbeddingGenerationJob } from "../queue/enqueue.js";
import { generateJobPersona } from "./persona.js";

type Db = ReturnType<typeof createDbClient>["db"];

type EmployerRouterOptions = {
  db: Db;
  cookieName: string;
  tokenPepper: string;
};

const contactPreferenceSchema = z.object({
  preferredChannel: z.enum(["email", "phone", "slack", "teams"]),
  responseWindow: z.string().min(1).max(120).optional()
});

const employerProfileSchema = z.object({
  companyName: z.string().min(1).max(160),
  companySize: z.enum(["startup", "small", "mid_market", "enterprise"]),
  industry: z.string().min(1).max(120),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  headquarters: z.string().min(1).max(120),
  hiringRoles: z.array(z.string().min(1).max(120)).min(1).max(25),
  hiringVolume: z.string().min(1).max(120),
  veteranHiringPriority: z.boolean(),
  clearanceSensitiveRoles: z.boolean(),
  hiringRegions: z.array(z.string().min(1).max(120)).min(1).max(25),
  recruiterName: z.string().min(1).max(120),
  recruiterTitle: z.string().min(1).max(120),
  recruiterTeam: z.string().min(1).max(120),
  contactPreferences: contactPreferenceSchema,
  complete: z.boolean().default(false)
});

const createJobSchema = z
  .object({
    title: z.string().min(1).max(160),
    department: z.string().max(120).nullable().optional(),
    locationCity: z.string().max(120).nullable().optional(),
    locationState: z.string().max(120).nullable().optional(),
    locationType: z.enum(["onsite", "hybrid", "remote"]),
    employmentType: z.enum(["full_time", "part_time", "contract", "internship"]),
    status: z.enum(["draft", "published", "closed"]).default("draft"),
    compensationMin: z.number().int().min(0).nullable().optional(),
    compensationMax: z.number().int().min(0).nullable().optional(),
    currency: z.string().min(3).max(3).default("USD"),
    description: z.string().min(1).max(5000),
    requirements: z.string().max(3000).nullable().optional(),
    mustHaveSkills: z.array(z.string().min(1).max(120)).min(1).max(30),
    niceToHaveSkills: z.array(z.string().min(1).max(120)).max(30),
    requiredExperienceLevel: z.string().max(120).nullable().optional(),
    clearanceRequirement: z.string().max(120).nullable().optional(),
    travelRequirement: z.string().max(120).nullable().optional()
  })
  .superRefine((data, ctx) => {
    if (
      data.compensationMin !== null &&
      data.compensationMin !== undefined &&
      data.compensationMax !== null &&
      data.compensationMax !== undefined &&
      data.compensationMin > data.compensationMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["compensationMin"],
        message: "compensationMin must be less than or equal to compensationMax"
      });
    }
  });

const createExportSchema = z.object({
  candidateProfileIds: z.array(z.string().uuid()).min(1).max(50),
  exportTarget: z.string().min(1).max(80).default("manual_handoff"),
  exportFormat: z.enum(["json", "csv"]).default("json"),
  externalSource: z.string().min(1).max(80).optional(),
  externalId: z.string().min(1).max(120).optional()
});

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function scoreLabel(value: number | null) {
  if (value === null || Number.isNaN(value)) return "unknown";
  if (value >= 0.8) return "strong";
  if (value >= 0.6) return "good";
  if (value >= 0.45) return "moderate";
  return "weak";
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function skillOverlap(input: { candidateSkills: string[]; mustHaveSkills: string[]; niceToHaveSkills: string[] }) {
  const candidateSet = new Set(input.candidateSkills.map((item) => normalizeText(item)));
  const mustSet = input.mustHaveSkills.map((item) => normalizeText(item)).filter(Boolean);
  const niceSet = input.niceToHaveSkills.map((item) => normalizeText(item)).filter(Boolean);

  const matchedMust = mustSet.filter((skill) => candidateSet.has(skill));
  const missingMust = mustSet.filter((skill) => !candidateSet.has(skill));
  const matchedNice = niceSet.filter((skill) => candidateSet.has(skill));
  const missingNice = niceSet.filter((skill) => !candidateSet.has(skill));

  return {
    matchedMustHave: matchedMust,
    missingMustHave: missingMust,
    matchedNiceToHave: matchedNice,
    missingNiceToHave: missingNice
  };
}

function buildFitSummaries(input: {
  componentScores: Record<string, number>;
  job: {
    locationType: string;
    locationState: string | null;
    clearanceRequirement: string | null;
    compensationMin: number | null;
    compensationMax: number | null;
  };
  candidate: {
    clearanceLevel: string | null;
    locationState: string | null;
    preferredWorkModes: string[];
    salaryExpectationMin: number | null;
    salaryExpectationMax: number | null;
  };
}) {
  const preferredModes = new Set(input.candidate.preferredWorkModes.map((mode) => normalizeText(mode)));
  const modeFit = preferredModes.has(normalizeText(input.job.locationType));
  const stateFit =
    input.job.locationState && input.candidate.locationState
      ? normalizeText(input.job.locationState) === normalizeText(input.candidate.locationState)
      : null;

  const compensationSummary = (() => {
    if (
      input.job.compensationMin === null ||
      input.job.compensationMax === null ||
      input.candidate.salaryExpectationMin === null ||
      input.candidate.salaryExpectationMax === null
    ) {
      return "Compensation alignment is partially known due to missing range data.";
    }
    const overlapMin = Math.max(input.job.compensationMin, input.candidate.salaryExpectationMin);
    const overlapMax = Math.min(input.job.compensationMax, input.candidate.salaryExpectationMax);
    if (overlapMin <= overlapMax) {
      return "Compensation expectation appears aligned with the posted range.";
    }
    return "Compensation expectation may exceed or miss the posted range.";
  })();

  return {
    leadership: `Leadership fit is ${scoreLabel(input.componentScores.leadershipFit ?? null)} based on persona and role expectations.`,
    clearance: input.job.clearanceRequirement
      ? input.candidate.clearanceLevel
        ? normalizeText(input.candidate.clearanceLevel) === normalizeText(input.job.clearanceRequirement)
          ? "Clearance requirement is satisfied."
          : "Clearance requirement may not be fully satisfied."
        : "Job requires clearance, but candidate clearance level is not provided."
      : "No specific clearance requirement on this job.",
    location:
      modeFit && (stateFit === true || stateFit === null)
        ? "Location/work-mode fit is compatible with job expectations."
        : "Location/work-mode fit is possible but not ideal for this role.",
    compensation: compensationSummary
  };
}

function buildStrengthsAndGaps(input: {
  componentScores: Record<string, number>;
  overlap: ReturnType<typeof skillOverlap>;
  personaStrengths: string[];
}) {
  const strengths = [...input.personaStrengths];
  const gaps: string[] = [];

  if ((input.componentScores.skillSimilarity ?? 0) >= 0.7) {
    strengths.push("Strong required-skill alignment.");
  } else if ((input.componentScores.skillSimilarity ?? 0) < 0.45) {
    gaps.push("Required-skill alignment is currently weak.");
  }

  if ((input.componentScores.personaFit ?? 0) >= 0.65) {
    strengths.push("Persona role-cluster fit aligns with this job family.");
  } else if ((input.componentScores.personaFit ?? 0) < 0.45) {
    gaps.push("Persona role-cluster fit is limited for this role.");
  }

  if ((input.componentScores.leadershipFit ?? 0) < 0.55) {
    gaps.push("Leadership fit is moderate and may need deeper interview validation.");
  }

  if ((input.componentScores.locationFit ?? 0) < 0.55) {
    gaps.push("Location/work-mode fit is compatible but not ideal.");
  }

  if ((input.componentScores.compensationFit ?? 0) < 0.55) {
    gaps.push("Compensation expectation may require alignment discussion.");
  }

  if (input.overlap.missingNiceToHave.length > 0) {
    gaps.push(`Missing preferred skills: ${input.overlap.missingNiceToHave.slice(0, 3).join(", ")}.`);
  }

  return {
    strengths: [...new Set(strengths)].slice(0, 8),
    gaps: [...new Set(gaps)].slice(0, 8)
  };
}

function csvEscape(value: string | number | null | undefined) {
  const raw = value === null || value === undefined ? "" : String(value);
  if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
    return `"${raw.replace(/"/g, "\"\"")}"`;
  }
  return raw;
}

function buildRecruiterHandoffSummary(input: {
  explanationBullets: string[];
  suggestedRoles: string[];
  strengths: string[];
  likelyGaps: string[];
}) {
  return {
    whyRecommended:
      input.explanationBullets.length > 0
        ? input.explanationBullets.slice(0, 2).join(" ")
        : "Recommendation is based on available score evidence.",
    roleFit: input.suggestedRoles.length > 0 ? input.suggestedRoles.slice(0, 3) : [],
    standoutStrengths: input.strengths.slice(0, 4),
    followUpGaps: input.likelyGaps.slice(0, 4)
  };
}

function isEmployerProfileComplete(profile: {
  name: string | null;
  size: string | null;
  industry: string | null;
  websiteUrl: string | null;
  headquarters: string | null;
  hiringRoles: unknown;
  hiringVolume: string | null;
  hiringRegions: unknown;
  recruiterTitle: string | null;
  recruiterTeam: string | null;
  contactPreferences: unknown;
  recruiterName: string | null;
}) {
  const contactPrefs =
    profile.contactPreferences && typeof profile.contactPreferences === "object"
      ? (profile.contactPreferences as { preferredChannel?: string })
      : {};

  return Boolean(
    profile.name &&
      profile.size &&
      profile.industry &&
      profile.websiteUrl &&
      profile.headquarters &&
      profile.hiringVolume &&
      profile.recruiterTitle &&
      profile.recruiterTeam &&
      profile.recruiterName &&
      contactPrefs.preferredChannel &&
      toStringArray(profile.hiringRoles).length > 0 &&
      toStringArray(profile.hiringRegions).length > 0
  );
}

export function createEmployerRouter(options: EmployerRouterOptions) {
  const router = Router();
  const auth = buildAuthMiddleware({
    db: options.db,
    cookieName: options.cookieName,
    tokenPepper: options.tokenPepper
  });

  router.use(auth.optionalAuth);
  router.use(auth.requireRole(["employer", "admin"]));

  async function getOwnedJob(authUserId: string, jobId: string, isAdmin: boolean) {
    const [job] = await options.db
      .select({
        id: jobs.id,
        companyId: jobs.companyId
      })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(isAdmin ? eq(jobs.id, jobId) : and(eq(jobs.id, jobId), eq(companies.ownerUserId, authUserId)))
      .limit(1);
    return job ?? null;
  }

  async function buildExportCandidatePackets(input: {
    jobId: string;
    candidateProfileIds: string[];
  }) {
    const [jobContext] = await options.db
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
      .where(eq(jobs.id, input.jobId))
      .limit(1);
    if (!jobContext) {
      throw new Error("Job context not found for export.");
    }

    const candidates = await options.db
      .select({
        veteranProfileId: veteranProfiles.id,
        fullName: users.fullName,
        headline: veteranProfiles.headline,
        militaryBranch: veteranProfiles.militaryBranch,
        mosCode: veteranProfiles.mosCode,
        mosTitle: veteranProfiles.mosTitle,
        highestRank: veteranProfiles.highestRank,
        yearsOfService: veteranProfiles.yearsOfService,
        clearanceLevel: veteranProfiles.clearanceLevel,
        locationCity: veteranProfiles.locationCity,
        locationState: veteranProfiles.locationState,
        preferredWorkModes: veteranProfiles.preferredWorkModes,
        salaryExpectationMin: veteranProfiles.salaryExpectationMin,
        salaryExpectationMax: veteranProfiles.salaryExpectationMax,
        responsibilitiesSummary: veteranProfiles.responsibilitiesSummary,
        keySkills: veteranProfiles.keySkills,
        desiredRoles: veteranProfiles.desiredRoles,
        translationVersion: veteranProfiles.translationVersion,
        translationConfidence: veteranProfiles.translationConfidence
      })
      .from(veteranProfiles)
      .innerJoin(users, eq(users.id, veteranProfiles.userId))
      .where(inArray(veteranProfiles.id, input.candidateProfileIds));

    const personas = await options.db
      .select({
        veteranProfileId: veteranPersonas.veteranProfileId,
        summary: veteranPersonas.summary,
        strengths: veteranPersonas.strengths,
        roleClusters: veteranPersonas.roleClusters,
        suggestedJobTitles: veteranPersonas.suggestedJobTitles,
        experienceLevel: veteranPersonas.experienceLevel,
        leadershipProfile: veteranPersonas.leadershipProfile,
        technicalProfile: veteranPersonas.technicalProfile
      })
      .from(veteranPersonas)
      .where(
        and(
          inArray(veteranPersonas.veteranProfileId, input.candidateProfileIds),
          eq(veteranPersonas.scope, "overall")
        )
      );
    const personaByCandidate = new Map(personas.map((row) => [row.veteranProfileId, row]));

    const scores = await options.db
      .select({
        id: candidateJobScores.id,
        veteranProfileId: candidateJobScores.veteranProfileId,
        matchRunId: candidateJobScores.matchRunId,
        score: candidateJobScores.score,
        semanticScore: candidateJobScores.semanticScore,
        ruleScore: candidateJobScores.ruleScore,
        explanation: candidateJobScores.explanation,
        explanationData: candidateJobScores.explanationData,
        rank: candidateJobScores.rank,
        createdAt: candidateJobScores.createdAt
      })
      .from(candidateJobScores)
      .where(
        and(
          eq(candidateJobScores.jobId, input.jobId),
          inArray(candidateJobScores.veteranProfileId, input.candidateProfileIds)
        )
      )
      .orderBy(desc(candidateJobScores.createdAt));
    const latestScoreByCandidate = new Map<string, (typeof scores)[number]>();
    for (const row of scores) {
      if (!latestScoreByCandidate.has(row.veteranProfileId)) {
        latestScoreByCandidate.set(row.veteranProfileId, row);
      }
    }

    const scoreIds = [...latestScoreByCandidate.values()].map((row) => row.id);
    const featureRows =
      scoreIds.length === 0
        ? []
        : await options.db
            .select({
              scoreId: candidateJobScoreFeatures.candidateJobScoreId,
              featureName: candidateJobScoreFeatures.featureName,
              featureWeight: candidateJobScoreFeatures.featureWeight,
              featureValue: candidateJobScoreFeatures.featureValue,
              featureImpact: candidateJobScoreFeatures.featureImpact,
              reasonCode: candidateJobScoreFeatures.reasonCode,
              displayOrder: candidateJobScoreFeatures.displayOrder
            })
            .from(candidateJobScoreFeatures)
            .where(inArray(candidateJobScoreFeatures.candidateJobScoreId, scoreIds))
            .orderBy(candidateJobScoreFeatures.displayOrder);
    const featuresByScoreId = new Map<string, typeof featureRows>();
    for (const feature of featureRows) {
      const list = featuresByScoreId.get(feature.scoreId) ?? [];
      list.push(feature);
      featuresByScoreId.set(feature.scoreId, list);
    }

    const applicationsRows = await options.db
      .select({
        id: applications.id,
        veteranProfileId: applications.veteranProfileId,
        status: applications.status,
        appliedAt: applications.appliedAt,
        updatedAt: applications.updatedAt
      })
      .from(applications)
      .where(
        and(
          eq(applications.jobId, input.jobId),
          inArray(applications.veteranProfileId, input.candidateProfileIds)
        )
      )
      .orderBy(desc(applications.updatedAt));
    const latestAppByCandidate = new Map<string, (typeof applicationsRows)[number]>();
    for (const row of applicationsRows) {
      if (!latestAppByCandidate.has(row.veteranProfileId)) {
        latestAppByCandidate.set(row.veteranProfileId, row);
      }
    }

    const historyRows = await options.db
      .select({
        veteranProfileId: veteranOccupationHistory.veteranProfileId,
        mosCode: veteranOccupationHistory.mosCode,
        mosTitle: veteranOccupationHistory.mosTitle,
        civilianEquivalentTitle: militaryOccupations.civilianEquivalentTitle,
        isPrimary: veteranOccupationHistory.isPrimary
      })
      .from(veteranOccupationHistory)
      .leftJoin(
        militaryOccupations,
        eq(militaryOccupations.id, veteranOccupationHistory.militaryOccupationId)
      )
      .where(inArray(veteranOccupationHistory.veteranProfileId, input.candidateProfileIds))
      .orderBy(desc(veteranOccupationHistory.isPrimary), desc(veteranOccupationHistory.startDate));
    const historyByCandidate = new Map<string, typeof historyRows>();
    for (const row of historyRows) {
      const list = historyByCandidate.get(row.veteranProfileId) ?? [];
      list.push(row);
      historyByCandidate.set(row.veteranProfileId, list);
    }

    const packetRows = candidates.map((candidate) => {
      const persona = personaByCandidate.get(candidate.veteranProfileId);
      const score = latestScoreByCandidate.get(candidate.veteranProfileId) ?? null;
      const explanationData =
        score?.explanationData && typeof score.explanationData === "object"
          ? (score.explanationData as Record<string, unknown>)
          : {};
      const componentScores =
        explanationData.componentScores && typeof explanationData.componentScores === "object"
          ? Object.fromEntries(
              Object.entries(explanationData.componentScores as Record<string, unknown>).map(([key, value]) => [
                key,
                parseNumeric(value) ?? 0
              ])
            )
          : {};
      const overlap = skillOverlap({
        candidateSkills: toStringArray(candidate.keySkills),
        mustHaveSkills: toStringArray(jobContext.mustHaveSkills),
        niceToHaveSkills: toStringArray(jobContext.niceToHaveSkills)
      });
      const fitSummaries = buildFitSummaries({
        componentScores,
        job: {
          locationType: jobContext.locationType,
          locationState: jobContext.locationState,
          clearanceRequirement: jobContext.clearanceRequirement,
          compensationMin: jobContext.compensationMin,
          compensationMax: jobContext.compensationMax
        },
        candidate: {
          clearanceLevel: candidate.clearanceLevel,
          locationState: candidate.locationState,
          preferredWorkModes: toStringArray(candidate.preferredWorkModes),
          salaryExpectationMin: candidate.salaryExpectationMin,
          salaryExpectationMax: candidate.salaryExpectationMax
        }
      });
      const strengthGap = buildStrengthsAndGaps({
        componentScores,
        overlap,
        personaStrengths: toStringArray(persona?.strengths)
      });
      const explanationBullets = (score?.explanation ?? "")
        .split(".")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 4);
      const handoffSummary = buildRecruiterHandoffSummary({
        explanationBullets,
        suggestedRoles: toStringArray(persona?.suggestedJobTitles),
        strengths: strengthGap.strengths,
        likelyGaps: strengthGap.gaps
      });

      const packet = {
        candidate: {
          veteranProfileId: candidate.veteranProfileId,
          fullName: candidate.fullName,
          headline:
            candidate.headline ??
            `${candidate.highestRank ?? "Veteran"} transitioning from ${candidate.mosTitle ?? "military operations"} to civilian roles.`,
          militaryTranslation: {
            branch: candidate.militaryBranch,
            mosCode: candidate.mosCode,
            mosTitle: candidate.mosTitle,
            highestRank: candidate.highestRank,
            yearsOfService: candidate.yearsOfService,
            translationVersion: candidate.translationVersion,
            translationConfidence: candidate.translationConfidence,
            occupationSnapshot: (historyByCandidate.get(candidate.veteranProfileId) ?? [])
              .slice(0, 4)
              .map((row) => ({
                mosCode: row.mosCode,
                mosTitle: row.mosTitle,
                civilianEquivalentTitle: row.civilianEquivalentTitle,
                isPrimary: row.isPrimary
              }))
          },
          personaSummary: persona?.summary ?? null,
          suggestedCivilianRoles: toStringArray(persona?.suggestedJobTitles),
          roleClusters: toStringArray(persona?.roleClusters),
          strengths: strengthGap.strengths,
          likelyGaps: strengthGap.gaps
        },
        job: {
          id: jobContext.id,
          title: jobContext.title,
          department: jobContext.department,
          requiredExperienceLevel: jobContext.requiredExperienceLevel,
          clearanceRequirement: jobContext.clearanceRequirement
        },
        match: score
          ? {
              score: parseNumeric(score.score),
              semanticScore: parseNumeric(score.semanticScore),
              ruleScore: parseNumeric(score.ruleScore),
              rank: score.rank,
              explanationBullets,
              topFeatureContributions: (featuresByScoreId.get(score.id) ?? []).slice(0, 5).map((feature) => ({
                featureName: feature.featureName,
                featureImpact: parseNumeric(feature.featureImpact),
                reasonCode: feature.reasonCode
              }))
            }
          : null,
        fitSummaries,
        handoffSummary,
        application: latestAppByCandidate.get(candidate.veteranProfileId)
          ? {
              id: latestAppByCandidate.get(candidate.veteranProfileId)!.id,
              status: latestAppByCandidate.get(candidate.veteranProfileId)!.status,
              appliedAt: latestAppByCandidate.get(candidate.veteranProfileId)!.appliedAt,
              updatedAt: latestAppByCandidate.get(candidate.veteranProfileId)!.updatedAt
            }
          : null
      };

      return {
        veteranProfileId: candidate.veteranProfileId,
        applicationId: latestAppByCandidate.get(candidate.veteranProfileId)?.id ?? null,
        matchRunId: score?.matchRunId ?? null,
        matchScore: score ? parseNumeric(score.score) : null,
        rank: score?.rank ?? null,
        packet
      };
    });

    return {
      jobContext,
      packets: packetRows
    };
  }

  async function applyEmployerCandidateAction(input: {
    req: AuthenticatedRequest;
    res: any;
    toStatus: WorkflowApplicationStatus;
    reasonCode: string;
    note: string;
  }) {
    const authUser = input.req.authUser;
    if (!authUser) {
      input.res.status(401).json({ ok: false, error: "Authentication required." });
      return;
    }

    const jobId = input.req.params.jobId;
    const veteranProfileId = input.req.params.veteranProfileId;

    const job = await getOwnedJob(authUser.id, jobId, authUser.role === "admin");
    if (!job) {
      input.res.status(404).json({ ok: false, error: "Job not found." });
      return;
    }

    const [veteran] = await options.db
      .select({ id: veteranProfiles.id })
      .from(veteranProfiles)
      .where(eq(veteranProfiles.id, veteranProfileId))
      .limit(1);

    if (!veteran) {
      input.res.status(404).json({ ok: false, error: "Veteran profile not found." });
      return;
    }

    const latest = await getLatestApplicationForPair(options.db, veteranProfileId, jobId);

    if (!latest) {
      const created = await createApplicationWithEvent({
        db: options.db,
        veteranProfileId,
        jobId,
        status: input.toStatus,
        source: "employer_action",
        createdByUserId: authUser.id,
        reasonCode: input.reasonCode,
        note: input.note
      });
      input.res.status(201).json({ ok: true, application: created, created: true });
      return;
    }

    if (latest.status === input.toStatus) {
      input.res.json({
        ok: true,
        application: {
          id: latest.id,
          status: latest.status,
          appliedAt: latest.appliedAt
        },
        created: false
      });
      return;
    }

    await transitionApplicationStatus({
      db: options.db,
      applicationId: latest.id,
      fromStatus: latest.status,
      toStatus: input.toStatus,
      createdByUserId: authUser.id,
      reasonCode: input.reasonCode,
      note: input.note
    });

    input.res.json({
      ok: true,
      application: {
        id: latest.id,
        status: input.toStatus
      },
      created: false
    });
  }

  router.get("/profile", async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    const [company] = await options.db
      .select({
        id: companies.id,
        ownerUserId: companies.ownerUserId,
        name: companies.name,
        size: companies.size,
        industry: companies.industry,
        websiteUrl: companies.websiteUrl,
        headquarters: companies.headquarters,
        hiringRoles: companies.hiringRoles,
        hiringVolume: companies.hiringVolume,
        veteranHiringPriority: companies.veteranHiringPriority,
        clearanceSensitiveRoles: companies.clearanceSensitiveRoles,
        hiringRegions: companies.hiringRegions,
        recruiterTitle: companies.recruiterTitle,
        recruiterTeam: companies.recruiterTeam,
        contactPreferences: companies.contactPreferences,
        profileCompletedAt: companies.profileCompletedAt,
        recruiterName: users.fullName
      })
      .from(companies)
      .leftJoin(users, eq(users.id, companies.ownerUserId))
      .where(eq(companies.ownerUserId, authUser.id))
      .orderBy(desc(companies.createdAt))
      .limit(1);

    if (!company) {
      return res.json({
        ok: true,
        profile: null,
        complete: false
      });
    }

    return res.json({
      ok: true,
      profile: {
        ...company,
        hiringRoles: toStringArray(company.hiringRoles),
        hiringRegions: toStringArray(company.hiringRegions)
      },
      complete: isEmployerProfileComplete(company)
    });
  });

  router.post("/profile", async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    const parsed = employerProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Invalid employer profile payload." });
    }

    const input = parsed.data;
    const now = new Date();

    await options.db
      .update(users)
      .set({
        fullName: input.recruiterName.trim(),
        updatedAt: now
      })
      .where(eq(users.id, authUser.id));

    const [existingCompany] = await options.db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.ownerUserId, authUser.id))
      .orderBy(desc(companies.createdAt))
      .limit(1);

    const upsertValues = {
      ownerUserId: authUser.id,
      name: input.companyName.trim(),
      size: input.companySize,
      industry: input.industry.trim(),
      websiteUrl: input.websiteUrl ? input.websiteUrl.trim() : null,
      headquarters: input.headquarters.trim(),
      hiringRoles: input.hiringRoles,
      hiringVolume: input.hiringVolume.trim(),
      veteranHiringPriority: input.veteranHiringPriority,
      clearanceSensitiveRoles: input.clearanceSensitiveRoles,
      hiringRegions: input.hiringRegions,
      recruiterTitle: input.recruiterTitle.trim(),
      recruiterTeam: input.recruiterTeam.trim(),
      contactPreferences: input.contactPreferences,
      profileCompletedAt: input.complete ? now : null,
      updatedAt: now
    };

    if (!existingCompany) {
      await options.db.insert(companies).values({
        ...upsertValues,
        createdAt: now
      });
    } else {
      await options.db.update(companies).set(upsertValues).where(eq(companies.id, existingCompany.id));
    }

    return res.json({ ok: true });
  });

  router.get("/jobs", async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    const [company] = await options.db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.ownerUserId, authUser.id))
      .orderBy(desc(companies.createdAt))
      .limit(1);

    if (!company) {
      return res.json({
        ok: true,
        jobs: []
      });
    }

    const rows = await options.db
      .select({
        id: jobs.id,
        title: jobs.title,
        department: jobs.department,
        locationCity: jobs.locationCity,
        locationState: jobs.locationState,
        locationType: jobs.locationType,
        employmentType: jobs.employmentType,
        status: jobs.status,
        compensationMin: jobs.compensationMin,
        compensationMax: jobs.compensationMax,
        currency: jobs.currency,
        requiredExperienceLevel: jobs.requiredExperienceLevel,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt
      })
      .from(jobs)
      .where(eq(jobs.companyId, company.id))
      .orderBy(desc(jobs.createdAt));

    return res.json({ ok: true, jobs: rows });
  });

  router.post("/jobs", async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    const parsed = createJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Invalid job payload." });
    }

    const [company] = await options.db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.ownerUserId, authUser.id))
      .orderBy(desc(companies.createdAt))
      .limit(1);

    if (!company) {
      return res.status(400).json({ ok: false, error: "Complete employer profile before posting jobs." });
    }

    const now = new Date();
    const input = parsed.data;
    const [created] = await options.db
      .insert(jobs)
      .values({
        companyId: company.id,
        postedByUserId: authUser.id,
        title: input.title.trim(),
        department: input.department?.trim() || null,
        locationCity: input.locationCity?.trim() || null,
        locationState: input.locationState?.trim() || null,
        locationType: input.locationType,
        employmentType: input.employmentType,
        status: input.status,
        compensationMin: input.compensationMin ?? null,
        compensationMax: input.compensationMax ?? null,
        currency: input.currency,
        description: input.description.trim(),
        requirements: input.requirements?.trim() || null,
        mustHaveSkills: input.mustHaveSkills,
        niceToHaveSkills: input.niceToHaveSkills,
        requiredExperienceLevel: input.requiredExperienceLevel?.trim() || null,
        clearanceRequirement: input.clearanceRequirement?.trim() || null,
        travelRequirement: input.travelRequirement?.trim() || null,
        publishedAt: input.status === "published" ? now : null,
        createdAt: now,
        updatedAt: now
      })
      .returning({
        id: jobs.id
      });

    return res.status(201).json({ ok: true, jobId: created.id });
  });

  router.get("/jobs/:jobId", async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    const jobId = req.params.jobId;

    const [job] = await options.db
      .select({
        id: jobs.id,
        companyId: jobs.companyId,
        title: jobs.title,
        department: jobs.department,
        locationCity: jobs.locationCity,
        locationState: jobs.locationState,
        locationType: jobs.locationType,
        employmentType: jobs.employmentType,
        status: jobs.status,
        compensationMin: jobs.compensationMin,
        compensationMax: jobs.compensationMax,
        currency: jobs.currency,
        description: jobs.description,
        requirements: jobs.requirements,
        mustHaveSkills: jobs.mustHaveSkills,
        niceToHaveSkills: jobs.niceToHaveSkills,
        requiredExperienceLevel: jobs.requiredExperienceLevel,
        clearanceRequirement: jobs.clearanceRequirement,
        travelRequirement: jobs.travelRequirement,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt
      })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(and(eq(jobs.id, jobId), eq(companies.ownerUserId, authUser.id)))
      .limit(1);

    if (!job) {
      return res.status(404).json({ ok: false, error: "Job not found." });
    }

    const [persona] = await options.db
      .select({
        id: jobPersonas.id,
        scope: jobPersonas.scope,
        summary: jobPersonas.summary,
        leadershipLevel: jobPersonas.leadershipLevel,
        executionVsStrategy: jobPersonas.executionVsStrategy,
        environmentType: jobPersonas.environmentType,
        technicalDepth: jobPersonas.technicalDepth,
        suggestedCandidateArchetypes: jobPersonas.suggestedCandidateArchetypes,
        prioritySignals: jobPersonas.prioritySignals,
        disqualifiers: jobPersonas.disqualifiers,
        suggestedRoleFamily: jobPersonas.suggestedRoleFamily,
        modelVersion: jobPersonas.modelVersion,
        embeddingStatus: jobPersonas.embeddingStatus,
        embeddingError: jobPersonas.embeddingError,
        embeddingQueuedAt: jobPersonas.embeddingQueuedAt,
        embeddingAttempts: jobPersonas.embeddingAttempts,
        embeddingRetryCount: jobPersonas.embeddingRetryCount,
        embeddingModelVersion: jobPersonas.embeddingModelVersion,
        sourceSnapshotHash: jobPersonas.sourceSnapshotHash,
        updatedAt: jobPersonas.updatedAt
      })
      .from(jobPersonas)
      .where(and(eq(jobPersonas.jobId, job.id), eq(jobPersonas.scope, "overall")))
      .limit(1);

    return res.json({
      ok: true,
      job: {
        ...job,
        mustHaveSkills: toStringArray(job.mustHaveSkills),
        niceToHaveSkills: toStringArray(job.niceToHaveSkills)
      },
      persona: persona
        ? {
            ...persona,
            suggestedCandidateArchetypes: toStringArray(persona.suggestedCandidateArchetypes),
            prioritySignals: toStringArray(persona.prioritySignals),
            disqualifiers: toStringArray(persona.disqualifiers)
          }
        : null
    });
  });

  router.get("/jobs/:jobId/candidates/:veteranProfileId", async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    const { jobId, veteranProfileId } = req.params;
    const job = await getOwnedJob(authUser.id, jobId, authUser.role === "admin");
    if (!job) {
      return res.status(404).json({ ok: false, error: "Job not found." });
    }

    const [jobContext] = await options.db
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
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (!jobContext) {
      return res.status(404).json({ ok: false, error: "Job context not found." });
    }

    const [candidate] = await options.db
      .select({
        veteranProfileId: veteranProfiles.id,
        userId: veteranProfiles.userId,
        fullName: users.fullName,
        headline: veteranProfiles.headline,
        militaryBranch: veteranProfiles.militaryBranch,
        mosCode: veteranProfiles.mosCode,
        mosTitle: veteranProfiles.mosTitle,
        highestRank: veteranProfiles.highestRank,
        yearsOfService: veteranProfiles.yearsOfService,
        clearanceLevel: veteranProfiles.clearanceLevel,
        locationCity: veteranProfiles.locationCity,
        locationState: veteranProfiles.locationState,
        preferredWorkModes: veteranProfiles.preferredWorkModes,
        salaryExpectationMin: veteranProfiles.salaryExpectationMin,
        salaryExpectationMax: veteranProfiles.salaryExpectationMax,
        responsibilitiesSummary: veteranProfiles.responsibilitiesSummary,
        keySkills: veteranProfiles.keySkills,
        desiredRoles: veteranProfiles.desiredRoles,
        translationVersion: veteranProfiles.translationVersion,
        translationConfidence: veteranProfiles.translationConfidence
      })
      .from(veteranProfiles)
      .innerJoin(users, eq(users.id, veteranProfiles.userId))
      .where(eq(veteranProfiles.id, veteranProfileId))
      .limit(1);

    if (!candidate) {
      return res.status(404).json({ ok: false, error: "Candidate not found." });
    }

    const [persona] = await options.db
      .select({
        summary: veteranPersonas.summary,
        strengths: veteranPersonas.strengths,
        roleClusters: veteranPersonas.roleClusters,
        suggestedJobTitles: veteranPersonas.suggestedJobTitles,
        experienceLevel: veteranPersonas.experienceLevel,
        leadershipProfile: veteranPersonas.leadershipProfile,
        technicalProfile: veteranPersonas.technicalProfile
      })
      .from(veteranPersonas)
      .where(and(eq(veteranPersonas.veteranProfileId, veteranProfileId), eq(veteranPersonas.scope, "overall")))
      .limit(1);

    const [score] = await options.db
      .select({
        id: candidateJobScores.id,
        matchRunId: candidateJobScores.matchRunId,
        score: candidateJobScores.score,
        semanticScore: candidateJobScores.semanticScore,
        ruleScore: candidateJobScores.ruleScore,
        explanation: candidateJobScores.explanation,
        explanationData: candidateJobScores.explanationData,
        rank: candidateJobScores.rank,
        createdAt: candidateJobScores.createdAt
      })
      .from(candidateJobScores)
      .where(
        and(eq(candidateJobScores.jobId, jobId), eq(candidateJobScores.veteranProfileId, veteranProfileId))
      )
      .orderBy(desc(candidateJobScores.createdAt))
      .limit(1);

    const features =
      !score
        ? []
        : await options.db
            .select({
              featureName: candidateJobScoreFeatures.featureName,
              featureWeight: candidateJobScoreFeatures.featureWeight,
              featureValue: candidateJobScoreFeatures.featureValue,
              featureImpact: candidateJobScoreFeatures.featureImpact,
              reasonCode: candidateJobScoreFeatures.reasonCode
            })
            .from(candidateJobScoreFeatures)
            .where(eq(candidateJobScoreFeatures.candidateJobScoreId, score.id))
            .orderBy(candidateJobScoreFeatures.displayOrder);

    const [latestApplication] = await options.db
      .select({
        id: applications.id,
        status: applications.status,
        appliedAt: applications.appliedAt,
        updatedAt: applications.updatedAt
      })
      .from(applications)
      .where(and(eq(applications.jobId, jobId), eq(applications.veteranProfileId, veteranProfileId)))
      .orderBy(desc(applications.updatedAt))
      .limit(1);

    const events =
      !latestApplication
        ? []
        : await options.db
            .select({
              eventType: applicationEvents.eventType,
              fromStatus: applicationEvents.fromStatus,
              toStatus: applicationEvents.toStatus,
              reasonCode: applicationEvents.reasonCode,
              note: applicationEvents.note,
              occurredAt: applicationEvents.occurredAt
            })
            .from(applicationEvents)
            .where(eq(applicationEvents.applicationId, latestApplication.id))
            .orderBy(desc(applicationEvents.occurredAt))
            .limit(5);

    const historyRows = await options.db
      .select({
        mosCode: veteranOccupationHistory.mosCode,
        mosTitle: veteranOccupationHistory.mosTitle,
        civilianEquivalentTitle: militaryOccupations.civilianEquivalentTitle,
        startDate: veteranOccupationHistory.startDate,
        endDate: veteranOccupationHistory.endDate,
        isPrimary: veteranOccupationHistory.isPrimary
      })
      .from(veteranOccupationHistory)
      .leftJoin(
        militaryOccupations,
        eq(militaryOccupations.id, veteranOccupationHistory.militaryOccupationId)
      )
      .where(eq(veteranOccupationHistory.veteranProfileId, veteranProfileId))
      .orderBy(desc(veteranOccupationHistory.isPrimary), desc(veteranOccupationHistory.startDate));

    const [resumeDocument] = await options.db
      .select({
        parserVersion: veteranDocuments.parserVersion,
        parseConfidence: veteranDocuments.parseConfidence,
        parsedData: veteranDocuments.parsedData
      })
      .from(veteranDocuments)
      .where(
        and(
          eq(veteranDocuments.veteranProfileId, veteranProfileId),
          eq(veteranDocuments.documentType, "resume"),
          eq(veteranDocuments.isActive, true),
          eq(veteranDocuments.parseStatus, "completed")
        )
      )
      .orderBy(desc(veteranDocuments.uploadedAt))
      .limit(1);

    const explanationData =
      score?.explanationData && typeof score.explanationData === "object"
        ? (score.explanationData as Record<string, unknown>)
        : {};
    const componentScores =
      explanationData.componentScores && typeof explanationData.componentScores === "object"
        ? Object.fromEntries(
            Object.entries(explanationData.componentScores as Record<string, unknown>).map(([key, value]) => [
              key,
              parseNumeric(value) ?? 0
            ])
          )
        : {};

    const overlap = skillOverlap({
      candidateSkills: toStringArray(candidate.keySkills),
      mustHaveSkills: toStringArray(jobContext.mustHaveSkills),
      niceToHaveSkills: toStringArray(jobContext.niceToHaveSkills)
    });

    const fitSummaries = buildFitSummaries({
      componentScores,
      job: {
        locationType: jobContext.locationType,
        locationState: jobContext.locationState,
        clearanceRequirement: jobContext.clearanceRequirement,
        compensationMin: jobContext.compensationMin,
        compensationMax: jobContext.compensationMax
      },
      candidate: {
        clearanceLevel: candidate.clearanceLevel,
        locationState: candidate.locationState,
        preferredWorkModes: toStringArray(candidate.preferredWorkModes),
        salaryExpectationMin: candidate.salaryExpectationMin,
        salaryExpectationMax: candidate.salaryExpectationMax
      }
    });

    const strengthGap = buildStrengthsAndGaps({
      componentScores,
      overlap,
      personaStrengths: toStringArray(persona?.strengths)
    });

    const parsedData =
      resumeDocument?.parsedData && typeof resumeDocument.parsedData === "object"
        ? (resumeDocument.parsedData as {
            summary?: string;
            skills?: string[];
            certifications?: string[];
          })
        : null;

    return res.json({
      ok: true,
      candidate: {
        veteranProfileId: candidate.veteranProfileId,
        fullName: candidate.fullName,
        headline:
          candidate.headline ??
          `${candidate.highestRank ?? "Veteran"} transitioning from ${candidate.mosTitle ?? "military operations"} to civilian roles.`,
        location: {
          city: candidate.locationCity,
          state: candidate.locationState,
          preferredWorkModes: toStringArray(candidate.preferredWorkModes)
        },
        militaryTranslation: {
          branch: candidate.militaryBranch,
          mosCode: candidate.mosCode,
          mosTitle: candidate.mosTitle,
          highestRank: candidate.highestRank,
          yearsOfService: candidate.yearsOfService,
          translationVersion: candidate.translationVersion,
          translationConfidence: candidate.translationConfidence,
          occupationHistory: historyRows.slice(0, 6).map((row) => ({
            mosCode: row.mosCode,
            mosTitle: row.mosTitle,
            civilianEquivalentTitle: row.civilianEquivalentTitle,
            startDate: row.startDate,
            endDate: row.endDate,
            isPrimary: row.isPrimary
          }))
        },
        profileSummary: {
          responsibilitiesSummary: candidate.responsibilitiesSummary,
          keySkills: toStringArray(candidate.keySkills),
          desiredRoles: toStringArray(candidate.desiredRoles),
          clearanceLevel: candidate.clearanceLevel,
          salaryExpectationMin: candidate.salaryExpectationMin,
          salaryExpectationMax: candidate.salaryExpectationMax
        },
        persona: {
          summary: persona?.summary ?? null,
          strengths: toStringArray(persona?.strengths),
          roleClusters: toStringArray(persona?.roleClusters),
          suggestedJobTitles: toStringArray(persona?.suggestedJobTitles),
          experienceLevel: persona?.experienceLevel ?? null,
          leadershipProfile: persona?.leadershipProfile ?? null,
          technicalProfile: persona?.technicalProfile ?? null
        },
        resumeSignals: parsedData
          ? {
              parserVersion: resumeDocument?.parserVersion ?? null,
              parseConfidence: resumeDocument?.parseConfidence ?? null,
              summary: parsedData.summary ?? null,
              topSkills: Array.isArray(parsedData.skills) ? parsedData.skills.slice(0, 10) : [],
              certifications: Array.isArray(parsedData.certifications)
                ? parsedData.certifications.slice(0, 8)
                : []
            }
          : null
      },
      jobContext: {
        id: jobContext.id,
        title: jobContext.title,
        department: jobContext.department,
        requiredExperienceLevel: jobContext.requiredExperienceLevel,
        clearanceRequirement: jobContext.clearanceRequirement
      },
      match: score
        ? {
            rank: score.rank,
            score: parseNumeric(score.score),
            semanticScore: parseNumeric(score.semanticScore),
            ruleScore: parseNumeric(score.ruleScore),
            explanation: score.explanation,
            explanationBullets: (score.explanation ?? "")
              .split(".")
              .map((item) => item.trim())
              .filter(Boolean)
              .slice(0, 4),
            components: componentScores,
            topFeatures: features.slice(0, 8).map((feature) => ({
              featureName: feature.featureName,
              featureWeight: parseNumeric(feature.featureWeight),
              featureValue: feature.featureValue,
              featureImpact: parseNumeric(feature.featureImpact),
              reasonCode: feature.reasonCode
            }))
          }
        : null,
      evidence: {
        skillOverlap: overlap,
        fitSummaries,
        strengths: strengthGap.strengths,
        likelyGaps: strengthGap.gaps
      },
      application: latestApplication
        ? {
            id: latestApplication.id,
            status: latestApplication.status,
            appliedAt: latestApplication.appliedAt,
            updatedAt: latestApplication.updatedAt,
            recentEvents: events
          }
        : null
    });
  });

  router.post("/jobs/:jobId/export", async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    const jobId = req.params.jobId;
    const job = await getOwnedJob(authUser.id, jobId, authUser.role === "admin");
    if (!job) {
      return res.status(404).json({ ok: false, error: "Job not found." });
    }

    const parsed = createExportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Invalid export payload." });
    }

    const candidateProfileIds = [...new Set(parsed.data.candidateProfileIds)];
    const { jobContext, packets } = await buildExportCandidatePackets({
      jobId,
      candidateProfileIds
    });

    if (packets.length !== candidateProfileIds.length) {
      const found = new Set(packets.map((item) => item.veteranProfileId));
      const missing = candidateProfileIds.filter((id) => !found.has(id));
      return res.status(400).json({
        ok: false,
        error: `Some candidates could not be resolved for export: ${missing.join(", ")}`
      });
    }

    const requestFingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          jobId,
          candidateProfileIds: [...candidateProfileIds].sort(),
          exportTarget: parsed.data.exportTarget,
          exportFormat: parsed.data.exportFormat,
          externalSource: parsed.data.externalSource ?? null
        })
      )
      .digest("hex");

    const dedupeWindowStart = new Date(Date.now() - 5 * 60 * 1000);
    const [recentMatch] = await options.db
      .select({
        id: jobCandidateExports.id,
        exportStatus: jobCandidateExports.exportStatus,
        createdAt: jobCandidateExports.createdAt
      })
      .from(jobCandidateExports)
      .where(
        and(
          eq(jobCandidateExports.jobId, jobId),
          eq(jobCandidateExports.requestFingerprint, requestFingerprint),
          eq(jobCandidateExports.exportedByUserId, authUser.id),
          gte(jobCandidateExports.createdAt, dedupeWindowStart)
        )
      )
      .orderBy(desc(jobCandidateExports.createdAt))
      .limit(1);

    if (recentMatch) {
      return res.json({
        ok: true,
        reused: true,
        exportId: recentMatch.id,
        status: recentMatch.exportStatus
      });
    }

    const now = new Date();
    const [createdExport] = await options.db
      .insert(jobCandidateExports)
      .values({
        jobId,
        exportStatus: "pending",
        exportTarget: parsed.data.exportTarget,
        exportFormat: parsed.data.exportFormat,
        requestFingerprint,
        externalSource: parsed.data.externalSource ?? null,
        externalId: parsed.data.externalId ?? null,
        exportedByUserId: authUser.id,
        candidateCount: packets.length,
        createdAt: now
      })
      .returning({ id: jobCandidateExports.id });

    try {
      const csvRows = [
        [
          "candidate_name",
          "headline",
          "job_title",
          "match_score",
          "rank",
          "application_status",
          "why_recommended",
          "standout_strengths",
          "follow_up_gaps",
          "suggested_roles"
        ].join(","),
        ...packets.map((item) =>
          [
            csvEscape(item.packet.candidate.fullName),
            csvEscape(item.packet.candidate.headline),
            csvEscape(jobContext.title),
            csvEscape(item.packet.match?.score ?? ""),
            csvEscape(item.packet.match?.rank ?? ""),
            csvEscape(item.packet.application?.status ?? "none"),
            csvEscape(item.packet.handoffSummary.whyRecommended),
            csvEscape(item.packet.handoffSummary.standoutStrengths.join(" | ")),
            csvEscape(item.packet.handoffSummary.followUpGaps.join(" | ")),
            csvEscape(item.packet.candidate.suggestedCivilianRoles.join(" | "))
          ].join(",")
        )
      ];
      const csvContent = csvRows.join("\n");

      await options.db.insert(jobCandidateExportItems).values(
        packets.map((item) => ({
          exportId: createdExport.id,
          veteranProfileId: item.veteranProfileId,
          applicationId: item.applicationId,
          matchRunId: item.matchRunId,
          matchScore: item.matchScore?.toFixed(6) ?? null,
          rank: item.rank,
          payload: item.packet
        }))
      );

      const payload = {
        meta: {
          exportId: createdExport.id,
          exportTarget: parsed.data.exportTarget,
          exportFormat: parsed.data.exportFormat,
          externalSource: parsed.data.externalSource ?? null,
          candidateCount: packets.length,
          generatedAt: now.toISOString()
        },
        job: {
          id: jobContext.id,
          title: jobContext.title,
          department: jobContext.department
        },
        recruiterHandoffPackets: packets.map((item) => item.packet),
        csvContent: parsed.data.exportFormat === "csv" ? csvContent : null
      };

      await options.db
        .update(jobCandidateExports)
        .set({
          exportStatus: "exported",
          payload,
          exportedAt: now,
          errorMessage: null
        })
        .where(eq(jobCandidateExports.id, createdExport.id));

      return res.status(201).json({
        ok: true,
        exportId: createdExport.id,
        status: "exported",
        candidateCount: packets.length
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate export payload.";
      await options.db
        .update(jobCandidateExports)
        .set({
          exportStatus: "failed",
          exportedAt: new Date(),
          errorMessage: message
        })
        .where(eq(jobCandidateExports.id, createdExport.id));

      return res.status(500).json({
        ok: false,
        error: "Export failed. Please retry."
      });
    }
  });

  router.get("/jobs/:jobId/exports", async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    const jobId = req.params.jobId;
    const job = await getOwnedJob(authUser.id, jobId, authUser.role === "admin");
    if (!job) {
      return res.status(404).json({ ok: false, error: "Job not found." });
    }

    const rows = await options.db
      .select({
        id: jobCandidateExports.id,
        exportStatus: jobCandidateExports.exportStatus,
        exportTarget: jobCandidateExports.exportTarget,
        exportFormat: jobCandidateExports.exportFormat,
        externalSource: jobCandidateExports.externalSource,
        externalId: jobCandidateExports.externalId,
        candidateCount: jobCandidateExports.candidateCount,
        exportedByUserId: jobCandidateExports.exportedByUserId,
        createdAt: jobCandidateExports.createdAt,
        exportedAt: jobCandidateExports.exportedAt,
        errorMessage: jobCandidateExports.errorMessage
      })
      .from(jobCandidateExports)
      .where(eq(jobCandidateExports.jobId, jobId))
      .orderBy(desc(jobCandidateExports.createdAt))
      .limit(50);

    return res.json({
      ok: true,
      exports: rows
    });
  });

  router.get("/jobs/:jobId/exports/:exportId", async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    const { jobId, exportId } = req.params;
    const job = await getOwnedJob(authUser.id, jobId, authUser.role === "admin");
    if (!job) {
      return res.status(404).json({ ok: false, error: "Job not found." });
    }

    const [exportRow] = await options.db
      .select({
        id: jobCandidateExports.id,
        jobId: jobCandidateExports.jobId,
        exportStatus: jobCandidateExports.exportStatus,
        exportTarget: jobCandidateExports.exportTarget,
        exportFormat: jobCandidateExports.exportFormat,
        externalSource: jobCandidateExports.externalSource,
        externalId: jobCandidateExports.externalId,
        candidateCount: jobCandidateExports.candidateCount,
        exportedByUserId: jobCandidateExports.exportedByUserId,
        payload: jobCandidateExports.payload,
        createdAt: jobCandidateExports.createdAt,
        exportedAt: jobCandidateExports.exportedAt,
        errorMessage: jobCandidateExports.errorMessage
      })
      .from(jobCandidateExports)
      .where(and(eq(jobCandidateExports.id, exportId), eq(jobCandidateExports.jobId, jobId)))
      .limit(1);

    if (!exportRow) {
      return res.status(404).json({ ok: false, error: "Export not found." });
    }

    const items = await options.db
      .select({
        veteranProfileId: jobCandidateExportItems.veteranProfileId,
        applicationId: jobCandidateExportItems.applicationId,
        matchRunId: jobCandidateExportItems.matchRunId,
        matchScore: jobCandidateExportItems.matchScore,
        rank: jobCandidateExportItems.rank,
        payload: jobCandidateExportItems.payload,
        createdAt: jobCandidateExportItems.createdAt
      })
      .from(jobCandidateExportItems)
      .where(eq(jobCandidateExportItems.exportId, exportId))
      .orderBy(jobCandidateExportItems.rank, desc(jobCandidateExportItems.createdAt));

    return res.json({
      ok: true,
      export: exportRow,
      items
    });
  });

  router.post("/jobs/:jobId/persona/generate", async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    const jobId = req.params.jobId;

    const [job] = await options.db
      .select({
        id: jobs.id,
        title: jobs.title,
        department: jobs.department,
        locationType: jobs.locationType,
        mustHaveSkills: jobs.mustHaveSkills,
        niceToHaveSkills: jobs.niceToHaveSkills,
        requiredExperienceLevel: jobs.requiredExperienceLevel,
        clearanceRequirement: jobs.clearanceRequirement,
        travelRequirement: jobs.travelRequirement,
        description: jobs.description
      })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(and(eq(jobs.id, jobId), eq(companies.ownerUserId, authUser.id)))
      .limit(1);

    if (!job) {
      return res.status(404).json({ ok: false, error: "Job not found." });
    }

    const persona = generateJobPersona({
      title: job.title,
      department: job.department,
      locationType: job.locationType,
      mustHaveSkills: toStringArray(job.mustHaveSkills),
      niceToHaveSkills: toStringArray(job.niceToHaveSkills),
      requiredExperienceLevel: job.requiredExperienceLevel,
      clearanceRequirement: job.clearanceRequirement,
      travelRequirement: job.travelRequirement,
      description: job.description
    });

    const now = new Date();
    const [existingPersona] = await options.db
      .select({
        id: jobPersonas.id,
        sourceSnapshotHash: jobPersonas.sourceSnapshotHash,
        embeddingStatus: jobPersonas.embeddingStatus,
        embeddingError: jobPersonas.embeddingError,
        embeddingQueuedAt: jobPersonas.embeddingQueuedAt,
        embeddingStartedAt: jobPersonas.embeddingStartedAt,
        embeddingFailedAt: jobPersonas.embeddingFailedAt,
        embeddingAttempts: jobPersonas.embeddingAttempts,
        embeddingRetryCount: jobPersonas.embeddingRetryCount,
        embeddingModelVersion: jobPersonas.embeddingModelVersion
      })
      .from(jobPersonas)
      .where(and(eq(jobPersonas.jobId, job.id), eq(jobPersonas.scope, "overall")))
      .limit(1);
    const shouldRefreshEmbedding =
      !existingPersona || existingPersona.sourceSnapshotHash !== persona.sourceSnapshotHash;

    const [savedPersona] = await options.db
      .insert(jobPersonas)
      .values({
        jobId: job.id,
        scope: "overall",
        summary: persona.summary,
        requiredTraits: persona.prioritySignals,
        preferredTraits: persona.suggestedCandidateArchetypes,
        leadershipLevel: persona.leadershipLevel,
        executionVsStrategy: persona.executionVsStrategy,
        environmentType: persona.environmentType,
        technicalDepth: persona.technicalDepth,
        suggestedCandidateArchetypes: persona.suggestedCandidateArchetypes,
        prioritySignals: persona.prioritySignals,
        disqualifiers: persona.disqualifiers,
        suggestedRoleFamily: persona.suggestedRoleFamily,
        modelVersion: persona.modelVersion,
        embeddingStatus: shouldRefreshEmbedding ? "pending" : (existingPersona?.embeddingStatus ?? "pending"),
        embeddingError: shouldRefreshEmbedding ? null : (existingPersona?.embeddingError ?? null),
        embeddingQueuedAt: shouldRefreshEmbedding ? now : (existingPersona?.embeddingQueuedAt ?? now),
        embeddingStartedAt: shouldRefreshEmbedding ? null : (existingPersona?.embeddingStartedAt ?? null),
        embeddingFailedAt: shouldRefreshEmbedding ? null : (existingPersona?.embeddingFailedAt ?? null),
        embeddingAttempts: shouldRefreshEmbedding
          ? 0
          : (existingPersona?.embeddingAttempts ?? 0),
        embeddingRetryCount: shouldRefreshEmbedding
          ? 0
          : (existingPersona?.embeddingRetryCount ?? 0),
        embeddingModelVersion: shouldRefreshEmbedding
          ? null
          : (existingPersona?.embeddingModelVersion ?? null),
        sourceSnapshotHash: persona.sourceSnapshotHash,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [jobPersonas.jobId, jobPersonas.scope],
        set: {
          summary: persona.summary,
          requiredTraits: persona.prioritySignals,
          preferredTraits: persona.suggestedCandidateArchetypes,
          leadershipLevel: persona.leadershipLevel,
          executionVsStrategy: persona.executionVsStrategy,
          environmentType: persona.environmentType,
          technicalDepth: persona.technicalDepth,
          suggestedCandidateArchetypes: persona.suggestedCandidateArchetypes,
          prioritySignals: persona.prioritySignals,
          disqualifiers: persona.disqualifiers,
          suggestedRoleFamily: persona.suggestedRoleFamily,
          modelVersion: persona.modelVersion,
          embeddingStatus: shouldRefreshEmbedding
            ? "pending"
            : (existingPersona?.embeddingStatus ?? "pending"),
          embeddingError: shouldRefreshEmbedding ? null : (existingPersona?.embeddingError ?? null),
          embeddingQueuedAt: shouldRefreshEmbedding
            ? now
            : (existingPersona?.embeddingQueuedAt ?? now),
          embeddingStartedAt: shouldRefreshEmbedding
            ? null
            : (existingPersona?.embeddingStartedAt ?? null),
          embeddingFailedAt: shouldRefreshEmbedding
            ? null
            : (existingPersona?.embeddingFailedAt ?? null),
          embeddingAttempts: shouldRefreshEmbedding
            ? 0
            : (existingPersona?.embeddingAttempts ?? 0),
          embeddingRetryCount: shouldRefreshEmbedding
            ? 0
            : (existingPersona?.embeddingRetryCount ?? 0),
          embeddingModelVersion: shouldRefreshEmbedding
            ? null
            : (existingPersona?.embeddingModelVersion ?? null),
          sourceSnapshotHash: persona.sourceSnapshotHash,
          updatedAt: now
        }
      })
      .returning({
        id: jobPersonas.id,
        sourceSnapshotHash: jobPersonas.sourceSnapshotHash
      });

    let embeddingEnqueued = false;
    if (!shouldRefreshEmbedding) {
      embeddingEnqueued = false;
    } else if (!env.EMBEDDINGS_ENABLED) {
      await options.db
        .update(jobPersonas)
        .set({
          embeddingStatus: "failed",
          embeddingError: "Embeddings disabled by configuration."
        })
        .where(eq(jobPersonas.id, savedPersona.id));
    } else if (savedPersona?.sourceSnapshotHash) {
      try {
        await enqueueEmbeddingGenerationJob(env.REDIS_URL, {
          targetType: "job_persona",
          targetId: savedPersona.id,
          sourceSnapshotHash: savedPersona.sourceSnapshotHash
        }, {
          attempts: env.QUEUE_EMBEDDING_JOB_ATTEMPTS ?? env.QUEUE_JOB_ATTEMPTS,
          backoffMs: env.QUEUE_EMBEDDING_JOB_BACKOFF_MS ?? env.QUEUE_JOB_BACKOFF_MS
        });
        embeddingEnqueued = true;
      } catch (error) {
        apiLogger.error("queue.job.enqueue", error, {
          action: "enqueue_job_embedding",
          route: "POST /employer/jobs/:jobId/persona/generate",
          userId: authUser.id,
          jobId: savedPersona.id,
          status: "fail"
        });
      }
    }

    return res.json({
      ok: true,
      embeddingEnqueued,
      persona: {
        scope: "overall",
        summary: persona.summary,
        leadershipLevel: persona.leadershipLevel,
        executionVsStrategy: persona.executionVsStrategy,
        environmentType: persona.environmentType,
        technicalDepth: persona.technicalDepth,
        suggestedCandidateArchetypes: persona.suggestedCandidateArchetypes,
        prioritySignals: persona.prioritySignals,
        disqualifiers: persona.disqualifiers,
        suggestedRoleFamily: persona.suggestedRoleFamily,
        modelVersion: persona.modelVersion,
        embeddingStatus: shouldRefreshEmbedding
          ? env.EMBEDDINGS_ENABLED
            ? "pending"
            : "failed"
          : (existingPersona?.embeddingStatus ?? "completed"),
        sourceSnapshotHash: persona.sourceSnapshotHash
      }
    });
  });

  router.post("/jobs/:jobId/candidates/:veteranProfileId/review", async (req: AuthenticatedRequest, res) => {
    await applyEmployerCandidateAction({
      req,
      res,
      toStatus: "reviewed",
      reasonCode: "employer_reviewed_candidate",
      note: "Employer marked candidate as reviewed."
    });
  });

  router.post("/jobs/:jobId/candidates/:veteranProfileId/shortlist", async (req: AuthenticatedRequest, res) => {
    await applyEmployerCandidateAction({
      req,
      res,
      toStatus: "shortlisted",
      reasonCode: "employer_shortlisted_candidate",
      note: "Employer shortlisted candidate from match results."
    });
  });

  router.post("/jobs/:jobId/candidates/:veteranProfileId/reject", async (req: AuthenticatedRequest, res) => {
    await applyEmployerCandidateAction({
      req,
      res,
      toStatus: "rejected",
      reasonCode: "employer_rejected_candidate",
      note: "Employer rejected candidate from job pipeline."
    });
  });

  router.post("/jobs/:jobId/candidates/:veteranProfileId/reset", async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    const jobId = req.params.jobId;
    const veteranProfileId = req.params.veteranProfileId;
    const job = await getOwnedJob(authUser.id, jobId, authUser.role === "admin");
    if (!job) {
      return res.status(404).json({ ok: false, error: "Job not found." });
    }

    const latest = await getLatestApplicationForPair(options.db, veteranProfileId, jobId);
    if (!latest) {
      return res.status(404).json({ ok: false, error: "No application/action found to reset." });
    }

    const fallbackStatus: WorkflowApplicationStatus = isActiveApplicationStatus(latest.status)
      ? "applied"
      : "closed";

    await transitionApplicationStatus({
      db: options.db,
      applicationId: latest.id,
      fromStatus: latest.status,
      toStatus: fallbackStatus,
      createdByUserId: authUser.id,
      reasonCode: "employer_reset_candidate_action",
      note: "Employer reset candidate action state."
    });

    return res.json({
      ok: true,
      application: {
        id: latest.id,
        status: fallbackStatus
      }
    });
  });

  return router;
}
