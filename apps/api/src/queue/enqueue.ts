import { Queue } from "bullmq";
import {
  QUEUE_NAMES,
  type MatchingRunJobPayload,
  type ResumeParsingJobPayload
} from "@boots2suits/shared";
import { getRedisConnection } from "./connection.js";

let resumeQueue: Queue<ResumeParsingJobPayload> | null = null;
let matchingQueue: Queue<MatchingRunJobPayload> | null = null;

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
