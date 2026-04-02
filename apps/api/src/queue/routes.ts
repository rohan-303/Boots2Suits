import { and, desc, eq, ne } from "drizzle-orm";
import { Queue } from "bullmq";
import { Router } from "express";
import { z } from "zod";
import {
  asyncJobDeadLetters,
  createDbClient,
  jobPersonas,
  matchRuns,
  veteranDocuments,
  veteranPersonas
} from "@boots2suits/db";
import { QUEUE_NAMES, apiLogger } from "@boots2suits/shared";
import { buildAuthMiddleware, type AuthenticatedRequest } from "../auth/middleware.js";
import { env } from "../config/env.js";
import {
  enqueueEmbeddingGenerationJob,
  enqueueMatchingRunJob,
  enqueueResumeParsingJob
} from "./enqueue.js";
import { getRedisConnection } from "./connection.js";

type Db = ReturnType<typeof createDbClient>["db"];

type AsyncOpsRouterOptions = {
  db: Db;
  cookieName: string;
  tokenPepper: string;
};

const listFailedJobsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  queue: z.enum([QUEUE_NAMES.resumeParsing, QUEUE_NAMES.matchingRuns, QUEUE_NAMES.embeddingGeneration]).optional()
});

const resumeReplayPayloadSchema = z.object({
  documentId: z.string().uuid(),
  veteranProfileId: z.string().uuid()
});

const matchingReplayPayloadSchema = z.object({
  matchRunId: z.string().uuid(),
  jobId: z.string().uuid(),
  requestedByUserId: z.string().uuid()
});

const embeddingReplayPayloadSchema = z.object({
  targetType: z.enum(["veteran_persona", "job_persona"]),
  targetId: z.string().uuid(),
  sourceSnapshotHash: z.string().min(1)
});

function getQueue(name: string) {
  return new Queue(name, {
    connection: getRedisConnection(env.REDIS_URL)
  });
}

async function inspectQueue(name: string) {
  const queue = getQueue(name);
  const counts = await queue.getJobCounts("waiting", "active", "failed", "delayed", "completed");
  const failed = await queue.getJobs(["failed"], 0, 9, true);

  return {
    queue: name,
    counts,
    recentFailed: failed.map((job) => ({
      id: String(job.id),
      name: job.name,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 1,
      failedReason: job.failedReason ?? null,
      timestamp: job.timestamp ?? null
    }))
  };
}

export function createAsyncOpsRouter(options: AsyncOpsRouterOptions) {
  const router = Router();
  const auth = buildAuthMiddleware({
    db: options.db,
    cookieName: options.cookieName,
    tokenPepper: options.tokenPepper
  });

  router.use(auth.optionalAuth);
  router.use(auth.requireRole(["admin"]));

  router.get("/queues", async (_req: AuthenticatedRequest, res) => {
    const queues = await Promise.all([
      inspectQueue(QUEUE_NAMES.resumeParsing),
      inspectQueue(QUEUE_NAMES.matchingRuns),
      inspectQueue(QUEUE_NAMES.embeddingGeneration)
    ]);

    return res.json({
      ok: true,
      inspectedAt: new Date().toISOString(),
      queues
    });
  });

  router.get("/failed-jobs", async (req: AuthenticatedRequest, res) => {
    const parsedQuery = listFailedJobsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({ ok: false, error: "Invalid failed jobs query." });
    }

    const whereClause = parsedQuery.data.queue
      ? and(
          ne(asyncJobDeadLetters.failureStatus, "resolved"),
          eq(asyncJobDeadLetters.queueName, parsedQuery.data.queue)
        )
      : ne(asyncJobDeadLetters.failureStatus, "resolved");

    const rows = await options.db
      .select({
        id: asyncJobDeadLetters.id,
        queueName: asyncJobDeadLetters.queueName,
        jobName: asyncJobDeadLetters.jobName,
        bullmqJobId: asyncJobDeadLetters.bullmqJobId,
        idempotencyKey: asyncJobDeadLetters.idempotencyKey,
        failureStatus: asyncJobDeadLetters.failureStatus,
        errorType: asyncJobDeadLetters.errorType,
        errorMessage: asyncJobDeadLetters.errorMessage,
        attemptsMade: asyncJobDeadLetters.attemptsMade,
        maxAttempts: asyncJobDeadLetters.maxAttempts,
        failedAt: asyncJobDeadLetters.failedAt,
        replayCount: asyncJobDeadLetters.replayCount,
        lastReplayAt: asyncJobDeadLetters.lastReplayAt,
        lastReplayByUserId: asyncJobDeadLetters.lastReplayByUserId
      })
      .from(asyncJobDeadLetters)
      .where(whereClause)
      .orderBy(desc(asyncJobDeadLetters.failedAt))
      .limit(parsedQuery.data.limit);

    return res.json({
      ok: true,
      failedJobs: rows
    });
  });

  router.post("/failed-jobs/:deadLetterId/replay", async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    const [deadLetter] = await options.db
      .select()
      .from(asyncJobDeadLetters)
      .where(eq(asyncJobDeadLetters.id, req.params.deadLetterId))
      .limit(1);

    if (!deadLetter) {
      return res.status(404).json({ ok: false, error: "Dead-letter record not found." });
    }

    if (deadLetter.replayCount >= env.QUEUE_REPLAY_MAX_PER_JOB) {
      return res.status(409).json({
        ok: false,
        error: `Replay limit reached for this failed job (${env.QUEUE_REPLAY_MAX_PER_JOB}).`
      });
    }

    const replaySuffix = `replay-${Date.now()}`;
    let replayedJobId = "";

    if (deadLetter.queueName === QUEUE_NAMES.resumeParsing) {
      const parsedPayload = resumeReplayPayloadSchema.safeParse(deadLetter.payload);
      if (!parsedPayload.success) {
        return res.status(400).json({ ok: false, error: "Invalid resume dead-letter payload." });
      }
      const payload = parsedPayload.data;

      await options.db
        .update(veteranDocuments)
        .set({
          parseStatus: "pending",
          parseError: null,
          parseErrorType: null,
          parseErrorStack: null,
          parseQueuedAt: new Date(),
          parseStartedAt: null,
          parseCompletedAt: null,
          parseFailedAt: null,
          parseDurationMs: null
        })
        .where(eq(veteranDocuments.id, payload.documentId));

      const job = await enqueueResumeParsingJob(
        env.REDIS_URL,
        payload,
        {
          attempts: env.QUEUE_RESUME_JOB_ATTEMPTS ?? env.QUEUE_JOB_ATTEMPTS,
          backoffMs: env.QUEUE_RESUME_JOB_BACKOFF_MS ?? env.QUEUE_JOB_BACKOFF_MS
        },
        {
          forceEnqueue: true,
          jobIdSuffix: replaySuffix
        }
      );
      replayedJobId = String(job.id);
    } else if (deadLetter.queueName === QUEUE_NAMES.matchingRuns) {
      const parsedPayload = matchingReplayPayloadSchema.safeParse(deadLetter.payload);
      if (!parsedPayload.success) {
        return res.status(400).json({ ok: false, error: "Invalid matching dead-letter payload." });
      }
      const payload = parsedPayload.data;

      await options.db
        .update(matchRuns)
        .set({
          status: "queued",
          queuedAt: new Date(),
          startedAt: null,
          completedAt: null,
          failedAt: null,
          errorMessage: null,
          errorType: null,
          errorStack: null,
          durationMs: null
        })
        .where(eq(matchRuns.id, payload.matchRunId));

      const job = await enqueueMatchingRunJob(
        env.REDIS_URL,
        payload,
        {
          attempts: env.QUEUE_MATCHING_JOB_ATTEMPTS ?? env.QUEUE_JOB_ATTEMPTS,
          backoffMs: env.QUEUE_MATCHING_JOB_BACKOFF_MS ?? env.QUEUE_JOB_BACKOFF_MS
        },
        {
          forceEnqueue: true,
          jobIdSuffix: replaySuffix
        }
      );
      replayedJobId = String(job.id);
    } else if (deadLetter.queueName === QUEUE_NAMES.embeddingGeneration) {
      const parsedPayload = embeddingReplayPayloadSchema.safeParse(deadLetter.payload);
      if (!parsedPayload.success) {
        return res.status(400).json({ ok: false, error: "Invalid embedding dead-letter payload." });
      }
      const payload = parsedPayload.data;

      if (payload.targetType === "veteran_persona") {
        await options.db
          .update(veteranPersonas)
          .set({
            embeddingStatus: "pending",
            embeddingError: null,
            embeddingErrorType: null,
            embeddingQueuedAt: new Date(),
            embeddingStartedAt: null,
            embeddingCompletedAt: null,
            embeddingFailedAt: null,
            embeddingDurationMs: null
          })
          .where(eq(veteranPersonas.id, payload.targetId));
      } else {
        await options.db
          .update(jobPersonas)
          .set({
            embeddingStatus: "pending",
            embeddingError: null,
            embeddingErrorType: null,
            embeddingQueuedAt: new Date(),
            embeddingStartedAt: null,
            embeddingCompletedAt: null,
            embeddingFailedAt: null,
            embeddingDurationMs: null
          })
          .where(eq(jobPersonas.id, payload.targetId));
      }

      const job = await enqueueEmbeddingGenerationJob(
        env.REDIS_URL,
        payload,
        {
          attempts: env.QUEUE_EMBEDDING_JOB_ATTEMPTS ?? env.QUEUE_JOB_ATTEMPTS,
          backoffMs: env.QUEUE_EMBEDDING_JOB_BACKOFF_MS ?? env.QUEUE_JOB_BACKOFF_MS
        },
        {
          forceEnqueue: true,
          jobIdSuffix: replaySuffix
        }
      );
      replayedJobId = String(job.id);
    } else {
      return res.status(400).json({ ok: false, error: "Unsupported dead-letter queue type." });
    }

    await options.db
      .update(asyncJobDeadLetters)
      .set({
        failureStatus: "replayed",
        replayCount: deadLetter.replayCount + 1,
        lastReplayAt: new Date(),
        lastReplayByUserId: authUser.id,
        lastReplayJobId: replayedJobId,
        updatedAt: new Date()
      })
      .where(eq(asyncJobDeadLetters.id, deadLetter.id));

    apiLogger.info("queue.job.replay", {
      action: "queue_job_replay",
      route: "POST /ops/async/failed-jobs/:deadLetterId/replay",
      userId: authUser.id,
      status: "success",
      queue: deadLetter.queueName,
      jobId: replayedJobId,
      deadLetterId: deadLetter.id
    });

    return res.status(202).json({
      ok: true,
      deadLetterId: deadLetter.id,
      replayedJobId,
      queue: deadLetter.queueName
    });
  });

  return router;
}
