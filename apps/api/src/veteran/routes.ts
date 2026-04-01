import { and, eq } from "drizzle-orm";
import { Router } from "express";
import {
  createDbClient,
  users,
  veteranPersonas,
  veteranProfiles
} from "@boots2suits/db";
import { z } from "zod";
import { buildAuthMiddleware, type AuthenticatedRequest } from "../auth/middleware.js";
import { generateOverallVeteranPersona } from "./persona.js";

type Db = ReturnType<typeof createDbClient>["db"];

type VeteranRouterOptions = {
  db: Db;
  cookieName: string;
  tokenPepper: string;
};

const profileSchema = z.object({
  fullName: z.string().min(1).max(120),
  locationCity: z.string().min(1).max(120),
  locationState: z.string().min(1).max(120),
  workAuthorization: z.string().min(1).max(120),
  relocationPreference: z.string().min(1).max(120),
  militaryBranch: z.enum([
    "army",
    "navy",
    "air_force",
    "marines",
    "space_force",
    "coast_guard",
    "national_guard",
    "other"
  ]),
  mosCode: z.string().min(1).max(50),
  mosTitle: z.string().min(1).max(150),
  highestRank: z.string().min(1).max(120),
  yearsOfService: z.number().int().min(0).max(60).nullable().optional(),
  serviceStartDate: z.string().nullable().optional(),
  serviceEndDate: z.string().nullable().optional(),
  clearanceLevel: z.enum([
    "none",
    "confidential",
    "secret",
    "top_secret",
    "ts_sci",
    "other"
  ]),
  responsibilitiesSummary: z.string().min(1).max(1000),
  keySkills: z.array(z.string().min(1)).min(1).max(20),
  toolsTechnologies: z.array(z.string().min(1)).max(20),
  leadershipExperience: z.string().min(1).max(600),
  industriesOfInterest: z.array(z.string().min(1)).max(12),
  desiredRoles: z.array(z.string().min(1)).min(1).max(12),
  preferredIndustries: z.array(z.string().min(1)).max(12),
  salaryExpectationMin: z.number().int().min(30000).nullable().optional(),
  salaryExpectationMax: z.number().int().min(30000).nullable().optional(),
  preferredWorkModes: z.array(z.enum(["remote", "hybrid", "onsite"])).min(1).max(3),
  complete: z.boolean().default(false)
});

function isProfileComplete(profile: {
  workAuthorization: string | null;
  relocationPreference: string | null;
  militaryBranch: string | null;
  mosCode: string | null;
  mosTitle: string | null;
  highestRank: string | null;
  responsibilitiesSummary: string | null;
  keySkills: unknown;
  desiredRoles: unknown;
  preferredWorkModes: unknown;
}) {
  return Boolean(
    profile.workAuthorization &&
      profile.relocationPreference &&
      profile.militaryBranch &&
      profile.mosCode &&
      profile.mosTitle &&
      profile.highestRank &&
      profile.responsibilitiesSummary &&
      Array.isArray(profile.keySkills) &&
      profile.keySkills.length > 0 &&
      Array.isArray(profile.desiredRoles) &&
      profile.desiredRoles.length > 0 &&
      Array.isArray(profile.preferredWorkModes) &&
      profile.preferredWorkModes.length > 0
  );
}

export function createVeteranRouter(options: VeteranRouterOptions) {
  const router = Router();
  const auth = buildAuthMiddleware({
    db: options.db,
    cookieName: options.cookieName,
    tokenPepper: options.tokenPepper
  });

  router.use(auth.optionalAuth);
  router.use(auth.requireRole(["veteran", "admin"]));

  router.get("/profile", async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    const [profile] = await options.db
      .select({
        id: veteranProfiles.id,
        userId: veteranProfiles.userId,
        militaryBranch: veteranProfiles.militaryBranch,
        mosCode: veteranProfiles.mosCode,
        mosTitle: veteranProfiles.mosTitle,
        highestRank: veteranProfiles.highestRank,
        yearsOfService: veteranProfiles.yearsOfService,
        serviceStartDate: veteranProfiles.serviceStartDate,
        serviceEndDate: veteranProfiles.serviceEndDate,
        clearanceLevel: veteranProfiles.clearanceLevel,
        workAuthorization: veteranProfiles.workAuthorization,
        relocationPreference: veteranProfiles.relocationPreference,
        responsibilitiesSummary: veteranProfiles.responsibilitiesSummary,
        keySkills: veteranProfiles.keySkills,
        toolsTechnologies: veteranProfiles.toolsTechnologies,
        leadershipExperience: veteranProfiles.leadershipExperience,
        industriesOfInterest: veteranProfiles.industriesOfInterest,
        desiredRoles: veteranProfiles.desiredRoles,
        preferredIndustries: veteranProfiles.preferredIndustries,
        salaryExpectationMin: veteranProfiles.salaryExpectationMin,
        salaryExpectationMax: veteranProfiles.salaryExpectationMax,
        preferredWorkModes: veteranProfiles.preferredWorkModes,
        locationCity: veteranProfiles.locationCity,
        locationState: veteranProfiles.locationState,
        profileCompletedAt: veteranProfiles.profileCompletedAt,
        translationVersion: veteranProfiles.translationVersion,
        translationConfidence: veteranProfiles.translationConfidence
      })
      .from(veteranProfiles)
      .where(eq(veteranProfiles.userId, authUser.id))
      .limit(1);

    if (!profile) {
      return res.json({
        ok: true,
        profile: null,
        complete: false,
        persona: null
      });
    }

    const [persona] = await options.db
      .select({
        id: veteranPersonas.id,
        scope: veteranPersonas.scope,
        summary: veteranPersonas.summary,
        strengths: veteranPersonas.strengths,
        roleClusters: veteranPersonas.roleClusters,
        experienceLevel: veteranPersonas.experienceLevel,
        leadershipProfile: veteranPersonas.leadershipProfile,
        technicalProfile: veteranPersonas.technicalProfile,
        suggestedJobTitles: veteranPersonas.suggestedJobTitles,
        modelVersion: veteranPersonas.modelVersion,
        sourceSnapshotHash: veteranPersonas.sourceSnapshotHash,
        updatedAt: veteranPersonas.updatedAt
      })
      .from(veteranPersonas)
      .where(
        and(eq(veteranPersonas.veteranProfileId, profile.id), eq(veteranPersonas.scope, "overall"))
      )
      .limit(1);

    return res.json({
      ok: true,
      profile,
      complete: isProfileComplete(profile),
      persona: persona ?? null
    });
  });

  router.post("/profile", async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "Invalid profile payload." });
    }

    const input = parsed.data;
    const now = new Date();

    await options.db
      .update(users)
      .set({
        fullName: input.fullName,
        updatedAt: now
      })
      .where(eq(users.id, authUser.id));

    const [existing] = await options.db
      .select({ id: veteranProfiles.id })
      .from(veteranProfiles)
      .where(eq(veteranProfiles.userId, authUser.id))
      .limit(1);

    const upsertData = {
      userId: authUser.id,
      militaryBranch: input.militaryBranch,
      mosCode: input.mosCode,
      mosTitle: input.mosTitle,
      highestRank: input.highestRank,
      yearsOfService: input.yearsOfService ?? null,
      serviceStartDate: input.serviceStartDate ?? null,
      serviceEndDate: input.serviceEndDate ?? null,
      clearanceLevel: input.clearanceLevel,
      workAuthorization: input.workAuthorization,
      relocationPreference: input.relocationPreference,
      responsibilitiesSummary: input.responsibilitiesSummary,
      keySkills: input.keySkills,
      toolsTechnologies: input.toolsTechnologies,
      leadershipExperience: input.leadershipExperience,
      industriesOfInterest: input.industriesOfInterest,
      desiredRoles: input.desiredRoles,
      preferredIndustries: input.preferredIndustries,
      salaryExpectationMin: input.salaryExpectationMin ?? null,
      salaryExpectationMax: input.salaryExpectationMax ?? null,
      preferredWorkModes: input.preferredWorkModes,
      locationCity: input.locationCity,
      locationState: input.locationState,
      profileCompletedAt: input.complete ? now : null,
      translationVersion: "trans-v1.2",
      translationConfidence: "0.900",
      updatedAt: now
    };

    if (!existing) {
      await options.db.insert(veteranProfiles).values({
        ...upsertData,
        createdAt: now
      });
    } else {
      await options.db.update(veteranProfiles).set(upsertData).where(eq(veteranProfiles.id, existing.id));
    }

    return res.json({ ok: true });
  });

  router.post("/persona/generate", async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    const [profile] = await options.db
      .select({
        id: veteranProfiles.id,
        userId: veteranProfiles.userId,
        militaryBranch: veteranProfiles.militaryBranch,
        mosCode: veteranProfiles.mosCode,
        mosTitle: veteranProfiles.mosTitle,
        highestRank: veteranProfiles.highestRank,
        yearsOfService: veteranProfiles.yearsOfService,
        responsibilitiesSummary: veteranProfiles.responsibilitiesSummary,
        keySkills: veteranProfiles.keySkills,
        toolsTechnologies: veteranProfiles.toolsTechnologies,
        leadershipExperience: veteranProfiles.leadershipExperience,
        industriesOfInterest: veteranProfiles.industriesOfInterest,
        desiredRoles: veteranProfiles.desiredRoles,
        preferredIndustries: veteranProfiles.preferredIndustries
      })
      .from(veteranProfiles)
      .where(eq(veteranProfiles.userId, authUser.id))
      .limit(1);

    if (!profile) {
      return res.status(404).json({ ok: false, error: "Profile not found." });
    }

    const persona = generateOverallVeteranPersona({
      fullName: authUser.fullName,
      militaryBranch: profile.militaryBranch,
      mosCode: profile.mosCode,
      mosTitle: profile.mosTitle,
      highestRank: profile.highestRank,
      yearsOfService: profile.yearsOfService,
      responsibilitiesSummary: profile.responsibilitiesSummary,
      keySkills: Array.isArray(profile.keySkills) ? profile.keySkills.map(String) : [],
      toolsTechnologies: Array.isArray(profile.toolsTechnologies)
        ? profile.toolsTechnologies.map(String)
        : [],
      leadershipExperience: profile.leadershipExperience,
      industriesOfInterest: Array.isArray(profile.industriesOfInterest)
        ? profile.industriesOfInterest.map(String)
        : [],
      desiredRoles: Array.isArray(profile.desiredRoles) ? profile.desiredRoles.map(String) : [],
      preferredIndustries: Array.isArray(profile.preferredIndustries)
        ? profile.preferredIndustries.map(String)
        : []
    });

    const now = new Date();

    await options.db
      .insert(veteranPersonas)
      .values({
        veteranProfileId: profile.id,
        scope: "overall",
        summary: persona.summary,
        strengths: persona.strengths,
        roleClusters: persona.roleClusters,
        experienceLevel: persona.experienceLevel,
        leadershipProfile: persona.leadershipProfile,
        technicalProfile: persona.technicalProfile,
        suggestedJobTitles: persona.suggestedJobTitles,
        modelVersion: persona.modelVersion,
        sourceSnapshotHash: persona.sourceSnapshotHash,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [veteranPersonas.veteranProfileId, veteranPersonas.scope],
        set: {
          summary: persona.summary,
          strengths: persona.strengths,
          roleClusters: persona.roleClusters,
          experienceLevel: persona.experienceLevel,
          leadershipProfile: persona.leadershipProfile,
          technicalProfile: persona.technicalProfile,
          suggestedJobTitles: persona.suggestedJobTitles,
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
        strengths: persona.strengths,
        roleClusters: persona.roleClusters,
        experienceLevel: persona.experienceLevel,
        leadershipProfile: persona.leadershipProfile,
        technicalProfile: persona.technicalProfile,
        suggestedJobTitles: persona.suggestedJobTitles,
        modelVersion: persona.modelVersion,
        sourceSnapshotHash: persona.sourceSnapshotHash
      }
    });
  });

  return router;
}

