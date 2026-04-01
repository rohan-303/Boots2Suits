import {
  and,
  desc,
  eq,
  inArray,
  isNotNull
} from "drizzle-orm";
import { Router } from "express";
import {
  candidateJobScoreFeatures,
  candidateJobScores,
  companies,
  createDbClient,
  applications,
  jobPersonas,
  jobs,
  matchRuns,
  users,
  veteranPersonas,
  veteranProfiles
} from "@boots2suits/db";
import { buildAuthMiddleware, type AuthenticatedRequest } from "../auth/middleware.js";
import { buildMatchRunFingerprint, scoreCandidateJobMatch } from "./engine.js";
import { defaultScoringConfig } from "./scoringConfig.js";

type Db = ReturnType<typeof createDbClient>["db"];

type MatchingRouterOptions = {
  db: Db;
  cookieName: string;
  tokenPepper: string;
};

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function toNum(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return null;
}

export function createMatchingRouter(options: MatchingRouterOptions) {
  const router = Router();
  const auth = buildAuthMiddleware({
    db: options.db,
    cookieName: options.cookieName,
    tokenPepper: options.tokenPepper
  });

  router.use(auth.optionalAuth);

  router.post("/jobs/:jobId/run", auth.requireRole(["employer", "admin"]), async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    const jobId = req.params.jobId;
    const [jobRow] = await options.db
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
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(
        authUser.role === "admin"
          ? eq(jobs.id, jobId)
          : and(eq(jobs.id, jobId), eq(companies.ownerUserId, authUser.id))
      )
      .limit(1);

    if (!jobRow) {
      return res.status(404).json({ ok: false, error: "Job not found." });
    }

    const [jobPersona] = await options.db
      .select({
        suggestedRoleFamily: jobPersonas.suggestedRoleFamily,
        leadershipLevel: jobPersonas.leadershipLevel,
        suggestedCandidateArchetypes: jobPersonas.suggestedCandidateArchetypes
      })
      .from(jobPersonas)
      .where(and(eq(jobPersonas.jobId, jobId), eq(jobPersonas.scope, "overall")))
      .limit(1);

    const veterans = await options.db
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
      return res.status(400).json({ ok: false, error: "No eligible veterans available for matching." });
    }

    const personas = await options.db
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
      const veteranPersona = personaByVeteranId.get(veteran.id);
      const match = scoreCandidateJobMatch({
        job: {
          id: jobRow.id,
          title: jobRow.title,
          department: jobRow.department,
          locationType: jobRow.locationType,
          locationState: jobRow.locationState,
          compensationMin: jobRow.compensationMin,
          compensationMax: jobRow.compensationMax,
          mustHaveSkills: asStringArray(jobRow.mustHaveSkills),
          niceToHaveSkills: asStringArray(jobRow.niceToHaveSkills),
          requiredExperienceLevel: jobRow.requiredExperienceLevel,
          clearanceRequirement: jobRow.clearanceRequirement
        },
        jobPersona: jobPersona
          ? {
              suggestedRoleFamily: jobPersona.suggestedRoleFamily,
              leadershipLevel: jobPersona.leadershipLevel,
              suggestedCandidateArchetypes: asStringArray(jobPersona.suggestedCandidateArchetypes)
            }
          : null,
        veteran: {
          id: veteran.id,
          userId: veteran.userId,
          locationState: veteran.locationState,
          preferredWorkModes: asStringArray(veteran.preferredWorkModes),
          yearsOfService: veteran.yearsOfService,
          clearanceLevel: veteran.clearanceLevel,
          salaryExpectationMin: veteran.salaryExpectationMin,
          salaryExpectationMax: veteran.salaryExpectationMax,
          keySkills: asStringArray(veteran.keySkills),
          desiredRoles: asStringArray(veteran.desiredRoles),
          highestRank: veteran.highestRank,
          leadershipExperience: veteran.leadershipExperience
        },
        veteranPersona: veteranPersona
          ? {
              roleClusters: asStringArray(veteranPersona.roleClusters),
              suggestedJobTitles: asStringArray(veteranPersona.suggestedJobTitles),
              leadershipProfile: veteranPersona.leadershipProfile,
              experienceLevel: veteranPersona.experienceLevel
            }
          : null
      });

      return {
        veteranProfileId: veteran.id,
        match
      };
    });

    const runSnapshotHash = scored
      .map((record) => record.match.sourceSnapshotHash)
      .sort()
      .join(":");
    const inputFingerprint = buildMatchRunFingerprint({
      jobId,
      jobSnapshotHash: runSnapshotHash,
      candidateIds: veterans.map((veteran) => veteran.id)
    });

    const [run] = await options.db
      .insert(matchRuns)
      .values({
        algorithmVersion: defaultScoringConfig.algorithmFamily,
        embeddingModelVersion: defaultScoringConfig.embeddingModelVersion,
        rerankerVersion: defaultScoringConfig.rerankerVersion,
        calibrationVersion: defaultScoringConfig.calibrationVersion,
        scoreVersion: defaultScoringConfig.version,
        explanationVersion: defaultScoringConfig.explanationVersion,
        inputFingerprint,
        sourceSnapshotHash: runSnapshotHash
      })
      .returning({ id: matchRuns.id });

    const ranked = [...scored].sort((left, right) => right.match.score - left.match.score);
    const scoreRows = ranked.map((item, idx) => ({
      veteranProfileId: item.veteranProfileId,
      jobId,
      matchRunId: run.id,
      algorithmVersion: defaultScoringConfig.algorithmFamily,
      embeddingModelVersion: defaultScoringConfig.embeddingModelVersion,
      rerankerVersion: defaultScoringConfig.rerankerVersion,
      calibrationVersion: defaultScoringConfig.calibrationVersion,
      scoreVersion: defaultScoringConfig.version,
      explanationVersion: defaultScoringConfig.explanationVersion,
      inputFingerprint,
      sourceSnapshotHash: item.match.sourceSnapshotHash,
      score: item.match.score.toFixed(6),
      semanticScore: item.match.semanticScore.toFixed(6),
      ruleScore: item.match.ruleScore.toFixed(6),
      explanation: item.match.explanation,
      explanationData: item.match.explanationData,
      rank: idx + 1
    }));

    const createdScores = await options.db
      .insert(candidateJobScores)
      .values(scoreRows)
      .returning({
        id: candidateJobScores.id,
        veteranProfileId: candidateJobScores.veteranProfileId
      });

    const scoreIdByVeteran = new Map(
      createdScores.map((row) => [row.veteranProfileId, row.id])
    );
    const featureRows = ranked.flatMap((item) => {
      const scoreId = scoreIdByVeteran.get(item.veteranProfileId);
      if (!scoreId) return [];
      const sortedFeatures = [...item.match.features]
        .sort((left, right) => Math.abs(right.featureImpact) - Math.abs(left.featureImpact));
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
      await options.db.insert(candidateJobScoreFeatures).values(featureRows);
    }

    return res.status(201).json({
      ok: true,
      matchRunId: run.id,
      totalCandidatesScored: ranked.length
    });
  });

  router.get("/jobs/:jobId/results", auth.requireRole(["employer", "admin"]), async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }
    const jobId = req.params.jobId;

    const [job] = await options.db
      .select({
        id: jobs.id,
        title: jobs.title
      })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(
        authUser.role === "admin"
          ? eq(jobs.id, jobId)
          : and(eq(jobs.id, jobId), eq(companies.ownerUserId, authUser.id))
      )
      .limit(1);

    if (!job) {
      return res.status(404).json({ ok: false, error: "Job not found." });
    }

    const [latest] = await options.db
      .select({
        matchRunId: candidateJobScores.matchRunId,
        createdAt: candidateJobScores.createdAt
      })
      .from(candidateJobScores)
      .where(eq(candidateJobScores.jobId, jobId))
      .orderBy(desc(candidateJobScores.createdAt))
      .limit(1);

    if (!latest) {
      return res.json({
        ok: true,
        job,
        matchRun: null,
        results: []
      });
    }

    const [runMeta] = await options.db
      .select({
        id: matchRuns.id,
        algorithmVersion: matchRuns.algorithmVersion,
        scoreVersion: matchRuns.scoreVersion,
        explanationVersion: matchRuns.explanationVersion,
        createdAt: matchRuns.createdAt
      })
      .from(matchRuns)
      .where(eq(matchRuns.id, latest.matchRunId))
      .limit(1);

    const rows = await options.db
      .select({
        scoreId: candidateJobScores.id,
        veteranProfileId: candidateJobScores.veteranProfileId,
        score: candidateJobScores.score,
        semanticScore: candidateJobScores.semanticScore,
        ruleScore: candidateJobScores.ruleScore,
        rank: candidateJobScores.rank,
        explanation: candidateJobScores.explanation,
        explanationData: candidateJobScores.explanationData,
        locationCity: veteranProfiles.locationCity,
        locationState: veteranProfiles.locationState,
        militaryBranch: veteranProfiles.militaryBranch,
        mosCode: veteranProfiles.mosCode,
        keySkills: veteranProfiles.keySkills,
        desiredRoles: veteranProfiles.desiredRoles,
        userFullName: users.fullName,
        userEmail: users.email,
        personaSummary: veteranPersonas.summary
      })
      .from(candidateJobScores)
      .innerJoin(veteranProfiles, eq(veteranProfiles.id, candidateJobScores.veteranProfileId))
      .innerJoin(users, eq(users.id, veteranProfiles.userId))
      .leftJoin(
        veteranPersonas,
        and(
          eq(veteranPersonas.veteranProfileId, veteranProfiles.id),
          eq(veteranPersonas.scope, "overall")
        )
      )
      .where(
        and(eq(candidateJobScores.jobId, jobId), eq(candidateJobScores.matchRunId, latest.matchRunId))
      )
      .orderBy(candidateJobScores.rank, desc(candidateJobScores.score));

    const features =
      rows.length === 0
        ? []
        : await options.db
            .select({
              candidateJobScoreId: candidateJobScoreFeatures.candidateJobScoreId,
              featureName: candidateJobScoreFeatures.featureName,
              featureWeight: candidateJobScoreFeatures.featureWeight,
              featureValue: candidateJobScoreFeatures.featureValue,
              featureImpact: candidateJobScoreFeatures.featureImpact,
              reasonCode: candidateJobScoreFeatures.reasonCode,
              displayOrder: candidateJobScoreFeatures.displayOrder
            })
            .from(candidateJobScoreFeatures)
            .where(
              inArray(
                candidateJobScoreFeatures.candidateJobScoreId,
                rows.map((row) => row.scoreId)
              )
            )
            .orderBy(candidateJobScoreFeatures.displayOrder);
    const featuresByScoreId = new Map<string, typeof features>();
    for (const feature of features) {
      const list = featuresByScoreId.get(feature.candidateJobScoreId) ?? [];
      list.push(feature);
      featuresByScoreId.set(feature.candidateJobScoreId, list);
    }

    const veteranIds = rows.map((row) => row.veteranProfileId);
    const applicationRows =
      veteranIds.length === 0
        ? []
        : await options.db
            .select({
              id: applications.id,
              veteranProfileId: applications.veteranProfileId,
              status: applications.status,
              updatedAt: applications.updatedAt
            })
            .from(applications)
            .where(
              and(
                eq(applications.jobId, jobId),
                inArray(applications.veteranProfileId, veteranIds)
              )
            )
            .orderBy(desc(applications.updatedAt));
    const latestAppByVeteran = new Map<string, (typeof applicationRows)[number]>();
    for (const app of applicationRows) {
      if (!latestAppByVeteran.has(app.veteranProfileId)) {
        latestAppByVeteran.set(app.veteranProfileId, app);
      }
    }

    return res.json({
      ok: true,
      job,
      matchRun: runMeta ?? null,
      results: rows.map((row) => ({
        veteranProfileId: row.veteranProfileId,
        candidate: {
          fullName: row.userFullName,
          email: row.userEmail,
          locationCity: row.locationCity,
          locationState: row.locationState,
          militaryBranch: row.militaryBranch,
          mosCode: row.mosCode,
          keySkills: asStringArray(row.keySkills),
          desiredRoles: asStringArray(row.desiredRoles),
          personaSummary: row.personaSummary
        },
        score: toNum(row.score),
        semanticScore: toNum(row.semanticScore),
        ruleScore: toNum(row.ruleScore),
        rank: row.rank,
        explanation: row.explanation,
        explanationBullets: (row.explanation ?? "")
          .split(".")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 3),
        explanationData: row.explanationData,
        topFeatures: (featuresByScoreId.get(row.scoreId) ?? []).slice(0, 5).map((feature) => ({
          featureName: feature.featureName,
          featureWeight: toNum(feature.featureWeight),
          featureValue: feature.featureValue,
          featureImpact: toNum(feature.featureImpact),
          reasonCode: feature.reasonCode
        })),
        application: latestAppByVeteran.get(row.veteranProfileId)
          ? {
              id: latestAppByVeteran.get(row.veteranProfileId)!.id,
              status: latestAppByVeteran.get(row.veteranProfileId)!.status,
              updatedAt: latestAppByVeteran.get(row.veteranProfileId)!.updatedAt
            }
          : null
      }))
    });
  });

  router.get(
    "/veterans/:veteranProfileId/jobs",
    auth.requireRole(["veteran", "admin"]),
    async (req: AuthenticatedRequest, res) => {
      const authUser = req.authUser;
      if (!authUser) {
        return res.status(401).json({ ok: false, error: "Authentication required." });
      }

      const veteranProfileId = req.params.veteranProfileId;
      const [profile] = await options.db
        .select({
          id: veteranProfiles.id,
          userId: veteranProfiles.userId
        })
        .from(veteranProfiles)
        .where(eq(veteranProfiles.id, veteranProfileId))
        .limit(1);

      if (!profile) {
        return res.status(404).json({ ok: false, error: "Veteran profile not found." });
      }

      if (authUser.role !== "admin" && profile.userId !== authUser.id) {
        return res.status(403).json({ ok: false, error: "Cannot access recommendations for this profile." });
      }

      const [latest] = await options.db
        .select({
          matchRunId: candidateJobScores.matchRunId
        })
        .from(candidateJobScores)
        .where(eq(candidateJobScores.veteranProfileId, veteranProfileId))
        .orderBy(desc(candidateJobScores.createdAt))
        .limit(1);

      if (!latest) {
        return res.json({
          ok: true,
          veteranProfileId,
          matchRun: null,
          results: []
        });
      }

      const [runMeta] = await options.db
        .select({
          id: matchRuns.id,
          algorithmVersion: matchRuns.algorithmVersion,
          scoreVersion: matchRuns.scoreVersion,
          explanationVersion: matchRuns.explanationVersion,
          createdAt: matchRuns.createdAt
        })
        .from(matchRuns)
        .where(eq(matchRuns.id, latest.matchRunId))
        .limit(1);

      const rows = await options.db
        .select({
          scoreId: candidateJobScores.id,
          jobId: jobs.id,
          title: jobs.title,
          department: jobs.department,
          locationType: jobs.locationType,
          locationCity: jobs.locationCity,
          locationState: jobs.locationState,
          status: jobs.status,
          companyName: companies.name,
          score: candidateJobScores.score,
          semanticScore: candidateJobScores.semanticScore,
          ruleScore: candidateJobScores.ruleScore,
          rank: candidateJobScores.rank,
          explanation: candidateJobScores.explanation,
          explanationData: candidateJobScores.explanationData,
          jobPersonaSummary: jobPersonas.summary
        })
        .from(candidateJobScores)
        .innerJoin(jobs, eq(jobs.id, candidateJobScores.jobId))
        .innerJoin(companies, eq(companies.id, jobs.companyId))
        .leftJoin(
          jobPersonas,
          and(eq(jobPersonas.jobId, jobs.id), eq(jobPersonas.scope, "overall"))
        )
        .where(
          and(
            eq(candidateJobScores.veteranProfileId, veteranProfileId),
            eq(candidateJobScores.matchRunId, latest.matchRunId)
          )
        )
        .orderBy(candidateJobScores.rank, desc(candidateJobScores.score));

      const features =
        rows.length === 0
          ? []
          : await options.db
              .select({
                candidateJobScoreId: candidateJobScoreFeatures.candidateJobScoreId,
                featureName: candidateJobScoreFeatures.featureName,
                featureWeight: candidateJobScoreFeatures.featureWeight,
                featureValue: candidateJobScoreFeatures.featureValue,
                featureImpact: candidateJobScoreFeatures.featureImpact,
                reasonCode: candidateJobScoreFeatures.reasonCode,
                displayOrder: candidateJobScoreFeatures.displayOrder
              })
              .from(candidateJobScoreFeatures)
              .where(
                inArray(
                  candidateJobScoreFeatures.candidateJobScoreId,
                  rows.map((row) => row.scoreId)
                )
              )
              .orderBy(candidateJobScoreFeatures.displayOrder);

      const featuresByScoreId = new Map<string, typeof features>();
      for (const feature of features) {
        const list = featuresByScoreId.get(feature.candidateJobScoreId) ?? [];
        list.push(feature);
        featuresByScoreId.set(feature.candidateJobScoreId, list);
      }

      const jobIds = rows.map((row) => row.jobId);
      const veteranApps =
        jobIds.length === 0
          ? []
          : await options.db
              .select({
                id: applications.id,
                jobId: applications.jobId,
                status: applications.status,
                updatedAt: applications.updatedAt
              })
              .from(applications)
              .where(
                and(
                  eq(applications.veteranProfileId, veteranProfileId),
                  inArray(applications.jobId, jobIds)
                )
              )
              .orderBy(desc(applications.updatedAt));
      const latestAppByJob = new Map<string, (typeof veteranApps)[number]>();
      for (const app of veteranApps) {
        if (!latestAppByJob.has(app.jobId)) {
          latestAppByJob.set(app.jobId, app);
        }
      }

      return res.json({
        ok: true,
        veteranProfileId,
        matchRun: runMeta ?? null,
        results: rows.map((row) => ({
          jobId: row.jobId,
          job: {
            title: row.title,
            department: row.department,
            locationType: row.locationType,
            locationCity: row.locationCity,
            locationState: row.locationState,
            status: row.status,
            companyName: row.companyName,
            jobPersonaSummary: row.jobPersonaSummary
          },
          score: toNum(row.score),
          semanticScore: toNum(row.semanticScore),
          ruleScore: toNum(row.ruleScore),
          rank: row.rank,
          explanation: row.explanation,
          explanationBullets: (row.explanation ?? "")
            .split(".")
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 3),
          explanationData: row.explanationData,
          topFeatures: (featuresByScoreId.get(row.scoreId) ?? []).slice(0, 5).map((feature) => ({
            featureName: feature.featureName,
            featureWeight: toNum(feature.featureWeight),
            featureValue: feature.featureValue,
            featureImpact: toNum(feature.featureImpact),
            reasonCode: feature.reasonCode
          })),
          application: latestAppByJob.get(row.jobId)
            ? {
                id: latestAppByJob.get(row.jobId)!.id,
                status: latestAppByJob.get(row.jobId)!.status,
                updatedAt: latestAppByJob.get(row.jobId)!.updatedAt
              }
            : null
        }))
      });
    }
  );

  return router;
}
