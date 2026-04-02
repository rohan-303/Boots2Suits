import { Queue } from "bullmq";
import {
  QUEUE_NAMES,
  type EmbeddingGenerationJobPayload,
  type MatchingRunJobPayload,
  type ResumeParsingJobPayload
} from "@boots2suits/shared";
import { getRedisConnection } from "./connection.js";

let resumeQueue: Queue<ResumeParsingJobPayload> | null = null;
let matchingQueue: Queue<MatchingRunJobPayload> | null = null;
let embeddingQueue: Queue<EmbeddingGenerationJobPayload> | null = null;

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

export async function enqueueResumeParsingJob(
  redisUrl: string,
  payload: ResumeParsingJobPayload
) {
  const queue = getResumeQueue(redisUrl);
  return queue.add("parse-resume", payload, {
    jobId: `resume:${payload.documentId}`,
    removeOnComplete: 50,
    removeOnFail: 100
  });
}

export async function enqueueMatchingRunJob(
  redisUrl: string,
  payload: MatchingRunJobPayload
) {
  const queue = getMatchingQueue(redisUrl);
  return queue.add("run-matching", payload, {
    jobId: `matchrun:${payload.matchRunId}`,
    removeOnComplete: 50,
    removeOnFail: 100
  });
}

export async function enqueueEmbeddingGenerationJob(
  redisUrl: string,
  payload: EmbeddingGenerationJobPayload
) {
  const queue = getEmbeddingQueue(redisUrl);
  return queue.add("generate-embedding", payload, {
    jobId: `embedding:${payload.targetType}:${payload.targetId}:${payload.sourceSnapshotHash}`,
    removeOnComplete: 100,
    removeOnFail: 200
  });
}
