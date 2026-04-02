import Redis from "ioredis";
import { UnrecoverableError, Worker, type Job } from "bullmq";
import { z } from "zod";
import { asyncJobDeadLetters, createDbClient } from "@boots2suits/db";
import {
  isRetryableError,
  normalizeError,
  workerLogger,
  type EmbeddingGenerationJobPayload,
  QUEUE_NAMES,
  type MatchingRunJobPayload,
  type ResumeParsingJobPayload
} from "@boots2suits/shared";
import { processMatchingRun } from "./matchingProcessor.js";
import { processResumeParsingJob } from "./resumeProcessor.js";
import { createEmbeddingsProviderFromEnv } from "./embeddings/provider.js";
import { processEmbeddingGenerationJob } from "./embeddingProcessor.js";

const envSchema = z.object({
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required for worker"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  MATCH_SEMANTIC_WEIGHT: z.coerce.number().min(0).max(1).default(0.6),
  MATCH_RULE_WEIGHT: z.coerce.number().min(0).max(1).default(0.4),
  MATCH_EMBEDDING_BLEND_WEIGHT: z.coerce.number().min(0).max(1).default(0.8),
  MATCH_STRUCTURED_BLEND_WEIGHT: z.coerce.number().min(0).max(1).default(0.2)
}).superRefine((parsed, ctx) => {
  const hybridTotal = parsed.MATCH_SEMANTIC_WEIGHT + parsed.MATCH_RULE_WEIGHT;
  if (Math.abs(hybridTotal - 1) > 0.0001) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "MATCH_SEMANTIC_WEIGHT + MATCH_RULE_WEIGHT must equal 1.0"
    });
  }
  const blendTotal = parsed.MATCH_EMBEDDING_BLEND_WEIGHT + parsed.MATCH_STRUCTURED_BLEND_WEIGHT;
  if (Math.abs(blendTotal - 1) > 0.0001) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "MATCH_EMBEDDING_BLEND_WEIGHT + MATCH_STRUCTURED_BLEND_WEIGHT must equal 1.0"
    });
  }
});

const env = envSchema.parse(process.env);
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const { db, pool } = createDbClient(env.DATABASE_URL);
const embeddingsProvider = createEmbeddingsProviderFromEnv();

async function recordTerminalFailure(input: {
  queueName: string;
  job: Job | undefined;
  error: unknown;
}) {
  if (!input.job) return;
  const normalized = normalizeError(input.error);
  const now = new Date();
  await db
    .insert(asyncJobDeadLetters)
    .values({
      queueName: input.queueName,
      jobName: input.job.name,
      bullmqJobId: String(input.job.id),
      idempotencyKey: String(input.job.id),
      payload: input.job.data as Record<string, unknown>,
      failureStatus: "failed",
      errorType: normalized.errorType,
      errorMessage: normalized.errorMessage,
      errorStack: normalized.errorStack,
      attemptsMade: input.job.attemptsMade,
      maxAttempts: input.job.opts.attempts ?? 1,
      failedAt: now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: [asyncJobDeadLetters.queueName, asyncJobDeadLetters.bullmqJobId],
      set: {
        failureStatus: "failed",
        errorType: normalized.errorType,
        errorMessage: normalized.errorMessage,
        errorStack: normalized.errorStack,
        attemptsMade: input.job.attemptsMade,
        maxAttempts: input.job.opts.attempts ?? 1,
        failedAt: now,
        updatedAt: now
      }
    });
}

const resumeWorker = new Worker<ResumeParsingJobPayload>(
  QUEUE_NAMES.resumeParsing,
  async (job) => {
    const timed = workerLogger.timed("worker.job.resume_parse", {
      action: "resume_parse",
      queue: QUEUE_NAMES.resumeParsing,
      jobId: String(job.id),
      status: "started",
      documentId: job.data.documentId
    });
    try {
      await processResumeParsingJob(db, job.data, {
        attemptNumber: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts ?? 1,
        startedAt: Date.now()
      });
      timed.success({
        status: "completed",
        attemptNumber: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts ?? 1
      });
    } catch (error) {
      timed.fail(error, {
        attemptNumber: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts ?? 1
      });
      if (!isRetryableError(error)) {
        throw new UnrecoverableError(error instanceof Error ? error.message : "Non-retryable resume parse failure.");
      }
      throw error;
    }
  },
  {
    connection,
    concurrency: env.WORKER_CONCURRENCY
  }
);

const matchingWorker = new Worker<MatchingRunJobPayload>(
  QUEUE_NAMES.matchingRuns,
  async (job) => {
    const timed = workerLogger.timed("worker.job.matching_run", {
      action: "matching_run",
      queue: QUEUE_NAMES.matchingRuns,
      jobId: String(job.id),
      status: "started",
      matchRunId: job.data.matchRunId
    });
    try {
      await processMatchingRun(db, {
        matchRunId: job.data.matchRunId,
        jobId: job.data.jobId
      }, {
        attemptNumber: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts ?? 1,
        startedAt: Date.now()
      }, {
        semanticWeight: env.MATCH_SEMANTIC_WEIGHT,
        ruleWeight: env.MATCH_RULE_WEIGHT,
        embeddingBlendWeight: env.MATCH_EMBEDDING_BLEND_WEIGHT,
        structuredBlendWeight: env.MATCH_STRUCTURED_BLEND_WEIGHT
      });
      timed.success({
        status: "completed",
        attemptNumber: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts ?? 1
      });
    } catch (error) {
      timed.fail(error, {
        attemptNumber: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts ?? 1
      });
      if (!isRetryableError(error)) {
        throw new UnrecoverableError(error instanceof Error ? error.message : "Non-retryable matching run failure.");
      }
      throw error;
    }
  },
  {
    connection,
    concurrency: env.WORKER_CONCURRENCY
  }
);

const embeddingWorker = new Worker<EmbeddingGenerationJobPayload>(
  QUEUE_NAMES.embeddingGeneration,
  async (job) => {
    const timed = workerLogger.timed("worker.job.embedding_generation", {
      action: "embedding_generation",
      queue: QUEUE_NAMES.embeddingGeneration,
      jobId: String(job.id),
      status: "started",
      targetType: job.data.targetType,
      targetId: job.data.targetId
    });
    try {
      await processEmbeddingGenerationJob(db, embeddingsProvider, job.data, {
        attemptNumber: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts ?? 1,
        startedAt: Date.now()
      });
      timed.success({
        status: "completed",
        attemptNumber: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts ?? 1
      });
    } catch (error) {
      timed.fail(error, {
        attemptNumber: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts ?? 1
      });
      if (!isRetryableError(error)) {
        throw new UnrecoverableError(error instanceof Error ? error.message : "Non-retryable embedding failure.");
      }
      throw error;
    }
  },
  {
    connection,
    concurrency: env.WORKER_CONCURRENCY
  }
);

resumeWorker.on("failed", (job, error) => {
  const attempts = job?.attemptsMade ?? 0;
  const maxAttempts = job?.opts?.attempts ?? 1;
  const willRetry = attempts < maxAttempts;
  workerLogger.error("worker.job.resume_parse", error, {
    action: "resume_parse",
    queue: QUEUE_NAMES.resumeParsing,
    jobId: String(job?.id ?? "unknown"),
    status: willRetry ? "retry" : "failed",
    attemptNumber: attempts,
    maxAttempts,
    documentId: job?.data.documentId
  });
  if (!willRetry) {
    void recordTerminalFailure({
      queueName: QUEUE_NAMES.resumeParsing,
      job,
      error
    });
  }
});

resumeWorker.on("completed", (job) => {
  workerLogger.info("worker.job.resume_parse", {
    action: "resume_parse",
    queue: QUEUE_NAMES.resumeParsing,
    jobId: String(job.id),
    status: "completed",
    attemptNumber: job.attemptsMade,
    maxAttempts: job.opts.attempts ?? 1
  });
});

matchingWorker.on("failed", (job, error) => {
  const attempts = job?.attemptsMade ?? 0;
  const maxAttempts = job?.opts?.attempts ?? 1;
  const willRetry = attempts < maxAttempts;
  workerLogger.error("worker.job.matching_run", error, {
    action: "matching_run",
    queue: QUEUE_NAMES.matchingRuns,
    jobId: String(job?.id ?? "unknown"),
    status: willRetry ? "retry" : "failed",
    attemptNumber: attempts,
    maxAttempts,
    matchRunId: job?.data.matchRunId
  });
  if (!willRetry) {
    void recordTerminalFailure({
      queueName: QUEUE_NAMES.matchingRuns,
      job,
      error
    });
  }
});

matchingWorker.on("completed", (job) => {
  workerLogger.info("worker.job.matching_run", {
    action: "matching_run",
    queue: QUEUE_NAMES.matchingRuns,
    jobId: String(job.id),
    status: "completed",
    attemptNumber: job.attemptsMade,
    maxAttempts: job.opts.attempts ?? 1,
    matchRunId: job.data.matchRunId
  });
});

embeddingWorker.on("failed", (job, error) => {
  const attempts = job?.attemptsMade ?? 0;
  const maxAttempts = job?.opts?.attempts ?? 1;
  const willRetry = attempts < maxAttempts;
  workerLogger.error("worker.job.embedding_generation", error, {
    action: "embedding_generation",
    queue: QUEUE_NAMES.embeddingGeneration,
    jobId: String(job?.id ?? "unknown"),
    status: willRetry ? "retry" : "failed",
    attemptNumber: attempts,
    maxAttempts,
    targetType: job?.data.targetType,
    targetId: job?.data.targetId
  });
  if (!willRetry) {
    void recordTerminalFailure({
      queueName: QUEUE_NAMES.embeddingGeneration,
      job,
      error
    });
  }
});

embeddingWorker.on("completed", (job) => {
  workerLogger.info("worker.job.embedding_generation", {
    action: "embedding_generation",
    queue: QUEUE_NAMES.embeddingGeneration,
    jobId: String(job.id),
    status: "completed",
    attemptNumber: job.attemptsMade,
    maxAttempts: job.opts.attempts ?? 1,
    targetType: job.data.targetType,
    targetId: job.data.targetId
  });
});

async function start() {
  await Promise.all([
    resumeWorker.waitUntilReady(),
    matchingWorker.waitUntilReady(),
    embeddingWorker.waitUntilReady()
  ]);
  workerLogger.info("worker.startup", {
    action: "worker_startup",
    status: "success",
    queues: [QUEUE_NAMES.resumeParsing, QUEUE_NAMES.matchingRuns, QUEUE_NAMES.embeddingGeneration],
    concurrency: env.WORKER_CONCURRENCY,
    embeddingMode: embeddingsProvider.mode,
    embeddingModelVersion: embeddingsProvider.modelVersion,
    matchWeights: {
      semantic: env.MATCH_SEMANTIC_WEIGHT,
      rule: env.MATCH_RULE_WEIGHT
    }
  });
}

async function shutdown(signal: NodeJS.Signals) {
  workerLogger.info("worker.shutdown", {
    action: "worker_shutdown",
    status: "start",
    signal
  });
  await Promise.all([resumeWorker.close(), matchingWorker.close(), embeddingWorker.close()]);
  await connection.quit();
  await pool.end();
  workerLogger.info("worker.shutdown", {
    action: "worker_shutdown",
    status: "success",
    signal
  });
  process.exit(0);
}

start().catch((error) => {
  workerLogger.error("worker.startup", error, {
    action: "worker_startup",
    status: "fail"
  });
  void connection.quit();
  void pool.end();
  process.exit(1);
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
