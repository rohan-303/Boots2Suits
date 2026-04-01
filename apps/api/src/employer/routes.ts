import { and, desc, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import {
  companies,
  createDbClient,
  jobPersonas,
  jobs,
  users
} from "@boots2suits/db";
import { buildAuthMiddleware, type AuthenticatedRequest } from "../auth/middleware.js";
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

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
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
    await options.db
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
          sourceSnapshotHash: persona.sourceSnapshotHash,
          updatedAt: now
        }
      });

    return res.json({
      ok: true,
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
        sourceSnapshotHash: persona.sourceSnapshotHash
      }
    });
  });

  return router;
}
