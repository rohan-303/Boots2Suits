import { Queue } from "bullmq";
import {
  QUEUE_NAMES,
  apiLogger,
  type EmbeddingGenerationJobPayload,
  type MatchingRunJobPayload,
  type ResumeParsingJobPayload
} from "@boots2suits/shared";
import { getRedisConnection } from "./connection.js";

let resumeQueue: Queue<ResumeParsingJobPayload> | null = null;
let matchingQueue: Queue<MatchingRunJobPayload> | null = null;
let embeddingQueue: Queue<EmbeddingGenerationJobPayload> | null = null;

export type RetryConfig = {
  attempts: number;
  backoffMs: number;
};

type EnqueueBehavior = {
  forceEnqueue?: boolean;
  jobIdSuffix?: string;
};

const ACTIVE_QUEUE_STATES = new Set([
  "waiting",
  "active",
  "delayed",
  "prioritized",
  "waiting-children"
]);

function getResumeQueue(redisUrl: string) {
  if (!resumeQueue) {
    resumeQueue = new Queue<ResumeParsingJobPayload>(QUEUE_NAMES.resumeParsing, {
      connection: getRedisConnection(redisUrl)
    });
  }
  return resumeQueue;
}

function getMatchingQueue(redisUrl: string) {
  if (!matchingQueue) {
    matchingQueue = new Queue<MatchingRunJobPayload>(QUEUE_NAMES.matchingRuns, {
      connection: getRedisConnection(redisUrl)
    });
  }
  return matchingQueue;
}

function getEmbeddingQueue(redisUrl: string) {
  if (!embeddingQueue) {
    embeddingQueue = new Queue<EmbeddingGenerationJobPayload>(QUEUE_NAMES.embeddingGeneration, {
      connection: getRedisConnection(redisUrl)
    });
  }
  return embeddingQueue;
}

function buildJobId(baseJobId: string, behavior?: EnqueueBehavior) {
  if (!behavior?.jobIdSuffix) return baseJobId;
  return `${baseJobId}:${behavior.jobIdSuffix}`;
}

async function findExistingJobById<T>(queue: Queue<T>, jobId: string) {
  const existing = await queue.getJob(jobId);
  if (!existing) {
    return null;
  }

  const state = await existing.getState();
  return { existing, state };
}

export async function enqueueResumeParsingJob(
  redisUrl: string,
  payload: ResumeParsingJobPayload,
  retryConfig: RetryConfig,
  behavior?: EnqueueBehavior
) {
  const queue = getResumeQueue(redisUrl);
  const jobId = buildJobId(`resume:${payload.documentId}`, behavior);
  const existing = await findExistingJobById(queue, jobId);
  if (!behavior?.forceEnqueue && existing && ACTIVE_QUEUE_STATES.has(existing.state)) {
    apiLogger.info("queue.job.enqueue", {
      action: "enqueue_resume_parse",
      queue: QUEUE_NAMES.resumeParsing,
      jobId: String(existing.existing.id),
      status: "deduped",
      existingState: existing.state,
      idempotencyKey: jobId
    });
    return existing.existing;
  }

  const job = await queue.add("parse-resume", payload, {
    jobId,
    attempts: retryConfig.attempts,
    backoff: {
      type: "exponential",
      delay: retryConfig.backoffMs
    },
    removeOnComplete: 50,
    removeOnFail: 100
  });
  apiLogger.info("queue.job.enqueue", {
    action: "enqueue_resume_parse",
    queue: QUEUE_NAMES.resumeParsing,
    jobId: String(job.id),
    status: "queued",
    idempotencyKey: jobId,
    attempts: retryConfig.attempts,
    backoffMs: retryConfig.backoffMs
  });
  return job;
}

export async function enqueueMatchingRunJob(
  redisUrl: string,
  payload: MatchingRunJobPayload,
  retryConfig: RetryConfig,
  behavior?: EnqueueBehavior
) {
  const queue = getMatchingQueue(redisUrl);
  const jobId = buildJobId(`matchrun:${payload.matchRunId}`, behavior);
  const existing = await findExistingJobById(queue, jobId);
  if (!behavior?.forceEnqueue && existing && ACTIVE_QUEUE_STATES.has(existing.state)) {
    apiLogger.info("queue.job.enqueue", {
      action: "enqueue_matching_run",
      queue: QUEUE_NAMES.matchingRuns,
      jobId: String(existing.existing.id),
      status: "deduped",
      existingState: existing.state,
      idempotencyKey: jobId
    });
    return existing.existing;
  }

  const job = await queue.add("run-matching", payload, {
    jobId,
    attempts: retryConfig.attempts,
    backoff: {
      type: "exponential",
      delay: retryConfig.backoffMs
    },
    removeOnComplete: 50,
    removeOnFail: 100
  });
  apiLogger.info("queue.job.enqueue", {
    action: "enqueue_matching_run",
    queue: QUEUE_NAMES.matchingRuns,
    jobId: String(job.id),
    status: "queued",
    idempotencyKey: jobId,
    attempts: retryConfig.attempts,
    backoffMs: retryConfig.backoffMs
  });
  return job;
}

export async function enqueueEmbeddingGenerationJob(
  redisUrl: string,
  payload: EmbeddingGenerationJobPayload,
  retryConfig: RetryConfig,
  behavior?: EnqueueBehavior
) {
  const queue = getEmbeddingQueue(redisUrl);
  const jobId = buildJobId(
    `embedding:${payload.targetType}:${payload.targetId}:${payload.sourceSnapshotHash}`,
    behavior
  );
  const existing = await findExistingJobById(queue, jobId);
  if (!behavior?.forceEnqueue && existing && ACTIVE_QUEUE_STATES.has(existing.state)) {
    apiLogger.info("queue.job.enqueue", {
      action: "enqueue_embedding_generation",
      queue: QUEUE_NAMES.embeddingGeneration,
      jobId: String(existing.existing.id),
      status: "deduped",
      existingState: existing.state,
      idempotencyKey: jobId
    });
    return existing.existing;
  }

  const job = await queue.add("generate-embedding", payload, {
    jobId,
    attempts: retryConfig.attempts,
    backoff: {
      type: "exponential",
      delay: retryConfig.backoffMs
    },
    removeOnComplete: 100,
    removeOnFail: 200
  });
  apiLogger.info("queue.job.enqueue", {
    action: "enqueue_embedding_generation",
    queue: QUEUE_NAMES.embeddingGeneration,
    jobId: String(job.id),
    status: "queued",
    idempotencyKey: jobId,
    attempts: retryConfig.attempts,
    backoffMs: retryConfig.backoffMs
  });
  return job;
}
