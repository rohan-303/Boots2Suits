import { and, desc, eq } from "drizzle-orm";
import { Router } from "express";
import {
  createDbClient,
  users,
  veteranDocuments,
  veteranPersonas,
  veteranProfiles
} from "@boots2suits/db";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { buildAuthMiddleware, type AuthenticatedRequest } from "../auth/middleware.js";
import { buildSafeProfileEnrichment } from "./enrichment.js";
import { generateOverallVeteranPersona } from "./persona.js";
import { extractPdfText, parseResumeText } from "./resumeParser.js";

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESUME_STORAGE_DIR = path.resolve(__dirname, "../../storage/resumes");
fs.mkdirSync(RESUME_STORAGE_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, RESUME_STORAGE_DIR),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      cb(null, `${Date.now()}-${safeName}`);
    }
  }),
  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      cb(new Error("Only PDF resume uploads are supported."));
      return;
    }
    cb(null, true);
  },
  limits: {
    fileSize: 8 * 1024 * 1024
  }
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
        persona: null,
        resume: null
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

    const [resumeDocument] = await options.db
      .select({
        id: veteranDocuments.id,
        originalFilename: veteranDocuments.originalFilename,
        parseStatus: veteranDocuments.parseStatus,
        parseConfidence: veteranDocuments.parseConfidence,
        parserVersion: veteranDocuments.parserVersion,
        parseError: veteranDocuments.parseError,
        parsedData: veteranDocuments.parsedData,
        uploadedAt: veteranDocuments.uploadedAt,
        parsedAt: veteranDocuments.parsedAt
      })
      .from(veteranDocuments)
      .where(
        and(
          eq(veteranDocuments.veteranProfileId, profile.id),
          eq(veteranDocuments.documentType, "resume"),
          eq(veteranDocuments.isActive, true)
        )
      )
      .orderBy(desc(veteranDocuments.uploadedAt))
      .limit(1);

    return res.json({
      ok: true,
      profile,
      complete: isProfileComplete(profile),
      persona: persona ?? null,
      resume: resumeDocument ?? null
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

  router.post(
    "/resume/upload",
    (req, res, next) => {
      upload.single("resume")(req, res, (error) => {
        if (error) {
          return res.status(400).json({
            ok: false,
            error: error instanceof Error ? error.message : "Resume upload failed."
          });
        }
        return next();
      });
    },
    async (req: AuthenticatedRequest, res) => {
      const authUser = req.authUser;
      if (!authUser) {
        return res.status(401).json({ ok: false, error: "Authentication required." });
      }

      if (!req.file) {
        return res.status(400).json({ ok: false, error: "Resume file is required." });
      }

      const [profile] = await options.db
        .select({
          id: veteranProfiles.id,
          responsibilitiesSummary: veteranProfiles.responsibilitiesSummary,
          leadershipExperience: veteranProfiles.leadershipExperience,
          keySkills: veteranProfiles.keySkills,
          toolsTechnologies: veteranProfiles.toolsTechnologies,
          desiredRoles: veteranProfiles.desiredRoles,
          civilianSummary: veteranProfiles.civilianSummary,
          translationConfidence: veteranProfiles.translationConfidence
        })
        .from(veteranProfiles)
        .where(eq(veteranProfiles.userId, authUser.id))
        .limit(1);

      if (!profile) {
        return res.status(400).json({
          ok: false,
          error: "Complete veteran onboarding profile before uploading a resume."
        });
      }

      const now = new Date();
      const [activeResume] = await options.db
        .select({
          id: veteranDocuments.id
        })
        .from(veteranDocuments)
        .where(
          and(
            eq(veteranDocuments.veteranProfileId, profile.id),
            eq(veteranDocuments.documentType, "resume"),
            eq(veteranDocuments.isActive, true)
          )
        )
        .orderBy(desc(veteranDocuments.uploadedAt))
        .limit(1);

      const [createdDoc] = await options.db
        .insert(veteranDocuments)
        .values({
          veteranProfileId: profile.id,
          documentType: "resume",
          isActive: true,
          originalFilename: req.file.originalname,
          mimeType: req.file.mimetype || "application/pdf",
          sizeBytes: req.file.size,
          storagePath: req.file.path,
          parseStatus: "uploaded",
          parserVersion: "pdf-parse-v1",
          uploadedByUserId: authUser.id,
          uploadedAt: now
        })
        .returning({ id: veteranDocuments.id });

      if (activeResume) {
        await options.db
          .update(veteranDocuments)
          .set({
            isActive: false,
            replacedByDocumentId: createdDoc.id
          })
          .where(eq(veteranDocuments.id, activeResume.id));
      }

      try {
        const fileBuffer = fs.readFileSync(req.file.path);
        const rawText = await extractPdfText(fileBuffer);
        const parsed = parseResumeText(rawText);
        const enrichment = buildSafeProfileEnrichment(profile, parsed);

        await options.db
          .update(veteranProfiles)
          .set({
            resumeText: rawText || null,
            ...enrichment,
            updatedAt: now
          })
          .where(eq(veteranProfiles.id, profile.id));

        await options.db
          .update(veteranDocuments)
          .set({
            parseStatus: "parsed",
            parseConfidence: parsed.confidence.toFixed(3),
            parserVersion: "pdf-parse-v1",
            parsedData: {
              summary: parsed.summary,
              experience: parsed.experience,
              education: parsed.education,
              certifications: parsed.certifications,
              skills: parsed.skills
            },
            parseError: null,
            parsedAt: now
          })
          .where(eq(veteranDocuments.id, createdDoc.id));

        return res.status(201).json({
          ok: true,
          resume: {
            id: createdDoc.id,
            parseStatus: "parsed",
            confidence: parsed.confidence,
            sectionsFound: {
              summary: Boolean(parsed.summary),
              experience: parsed.experience.length,
              education: parsed.education.length,
              certifications: parsed.certifications.length,
              skills: parsed.skills.length
            }
          }
        });
      } catch (error) {
        await options.db
          .update(veteranDocuments)
          .set({
            parseStatus: "failed",
            parseError: error instanceof Error ? error.message : "Resume parsing failed.",
            parsedAt: now
          })
          .where(eq(veteranDocuments.id, createdDoc.id));

        return res.status(500).json({
          ok: false,
          error: "Resume uploaded but parsing failed. Please try another PDF."
        });
      }
    }
  );

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

    const [resumeDocument] = await options.db
      .select({
        parsedData: veteranDocuments.parsedData
      })
      .from(veteranDocuments)
      .where(
        and(
          eq(veteranDocuments.veteranProfileId, profile.id),
          eq(veteranDocuments.documentType, "resume"),
          eq(veteranDocuments.isActive, true),
          eq(veteranDocuments.parseStatus, "parsed")
        )
      )
      .orderBy(desc(veteranDocuments.uploadedAt))
      .limit(1);

    const parsedData =
      resumeDocument?.parsedData && typeof resumeDocument.parsedData === "object"
        ? (resumeDocument.parsedData as {
            summary?: string;
            skills?: string[];
            experience?: string[];
          })
        : null;
    const inferredRoles: string[] = [];
    if (parsedData?.experience && Array.isArray(parsedData.experience)) {
      const expText = parsedData.experience.join(" ").toLowerCase();
      if (expText.includes("operations")) inferredRoles.push("operations specialist");
      if (expText.includes("program")) inferredRoles.push("program coordinator");
      if (expText.includes("logistics")) inferredRoles.push("logistics coordinator");
      if (expText.includes("support")) inferredRoles.push("support specialist");
      if (expText.includes("security")) inferredRoles.push("security operations specialist");
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
        : [],
      parsedResumeSignals: parsedData
        ? {
            summary: parsedData.summary ?? null,
            skills: Array.isArray(parsedData.skills) ? parsedData.skills.map(String) : [],
            inferredRoles
          }
        : undefined
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
