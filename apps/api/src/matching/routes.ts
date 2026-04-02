import {
  and,
  desc,
  eq,
  inArray
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
import { defaultScoringConfig } from "./scoringConfig.js";
import { enqueueMatchingRunJob } from "../queue/enqueue.js";
import { env } from "../config/env.js";

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

function requestedEmbeddingModelVersion() {
  if (env.EMBEDDINGS_PROVIDER === "openai" && env.EMBEDDINGS_API_KEY) {
    return `openai:${env.EMBEDDINGS_MODEL}`;
  }
  return "structured-fallback-v1";
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
        status: jobs.status
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

    if (jobRow.status === "closed") {
      return res.status(400).json({ ok: false, error: "Cannot run matching for a closed job." });
    }

    const [run] = await options.db
      .insert(matchRuns)
      .values({
        jobId,
        algorithmVersion: defaultScoringConfig.algorithmFamily,
        embeddingModelVersion: requestedEmbeddingModelVersion(),
        rerankerVersion: defaultScoringConfig.rerankerVersion,
        calibrationVersion: defaultScoringConfig.calibrationVersion,
        scoreVersion: defaultScoringConfig.version,
        explanationVersion: defaultScoringConfig.explanationVersion,
        status: "queued",
        requestedByUserId: authUser.id
      })
      .returning({ id: matchRuns.id });

    try {
      await enqueueMatchingRunJob(env.REDIS_URL, {
        matchRunId: run.id,
        jobId,
        requestedByUserId: authUser.id
      });
    } catch (error) {
      await options.db
        .update(matchRuns)
        .set({
          status: "failed",
          failedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Failed to enqueue match run."
        })
        .where(eq(matchRuns.id, run.id));

      return res.status(500).json({
        ok: false,
        error: "Unable to enqueue matching run."
      });
    }

    return res.status(202).json({
      ok: true,
      matchRunId: run.id,
      status: "queued"
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

    const [latestRun] = await options.db
      .select({
        id: matchRuns.id,
        status: matchRuns.status,
        algorithmVersion: matchRuns.algorithmVersion,
        embeddingModelVersion: matchRuns.embeddingModelVersion,
        scoreVersion: matchRuns.scoreVersion,
        explanationVersion: matchRuns.explanationVersion,
        createdAt: matchRuns.createdAt,
        startedAt: matchRuns.startedAt,
        completedAt: matchRuns.completedAt,
        failedAt: matchRuns.failedAt,
        errorMessage: matchRuns.errorMessage
      })
      .from(matchRuns)
      .where(eq(matchRuns.jobId, jobId))
      .orderBy(desc(matchRuns.createdAt))
      .limit(1);

    if (!latestRun) {
      return res.json({
        ok: true,
        job,
        matchRun: null,
        results: []
      });
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

    if (!latest || latest.matchRunId !== latestRun.id) {
      return res.json({
        ok: true,
        job,
        matchRun: latestRun,
        results: []
      });
    }

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
      matchRun: latestRun,
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

      const [latestScoreRun] = await options.db
        .select({
          matchRunId: candidateJobScores.matchRunId
        })
        .from(candidateJobScores)
        .where(eq(candidateJobScores.veteranProfileId, veteranProfileId))
        .orderBy(desc(candidateJobScores.createdAt))
        .limit(1);

      if (!latestScoreRun) {
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
          status: matchRuns.status,
          algorithmVersion: matchRuns.algorithmVersion,
          embeddingModelVersion: matchRuns.embeddingModelVersion,
          scoreVersion: matchRuns.scoreVersion,
          explanationVersion: matchRuns.explanationVersion,
          createdAt: matchRuns.createdAt,
          startedAt: matchRuns.startedAt,
          completedAt: matchRuns.completedAt,
          failedAt: matchRuns.failedAt,
          errorMessage: matchRuns.errorMessage
        })
        .from(matchRuns)
      .where(eq(matchRuns.id, latestScoreRun.matchRunId))
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
            eq(candidateJobScores.matchRunId, latestScoreRun.matchRunId)
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
