import Redis from "ioredis";
import { Worker } from "bullmq";
import { z } from "zod";
import { createDbClient } from "@boots2suits/db";
import {
  QUEUE_NAMES,
  type MatchingRunJobPayload,
  type ResumeParsingJobPayload
} from "@boots2suits/shared";
import { processMatchingRun } from "./matchingProcessor.js";
import { processResumeParsingJob } from "./resumeProcessor.js";

const envSchema = z.object({
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required for worker"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2)
});

const env = envSchema.parse(process.env);
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const { db, pool } = createDbClient(env.DATABASE_URL);

const resumeWorker = new Worker<ResumeParsingJobPayload>(
  QUEUE_NAMES.resumeParsing,
  async (job) => {
    console.log(`[worker] resume parse start job=${job.id} document=${job.data.documentId}`);
    await processResumeParsingJob(db, job.data);
    console.log(`[worker] resume parse completed job=${job.id} document=${job.data.documentId}`);
  },
  {
    connection,
    concurrency: env.WORKER_CONCURRENCY
  }
);

const matchingWorker = new Worker<MatchingRunJobPayload>(
  QUEUE_NAMES.matchingRuns,
  async (job) => {
    console.log(`[worker] matching run start job=${job.id} run=${job.data.matchRunId}`);
    await processMatchingRun(db, {
      matchRunId: job.data.matchRunId,
      jobId: job.data.jobId
    });
    console.log(`[worker] matching run completed job=${job.id} run=${job.data.matchRunId}`);
  },
  {
    connection,
    concurrency: env.WORKER_CONCURRENCY
  }
);

resumeWorker.on("failed", (job, error) => {
  console.error(`[worker] resume parse failed job=${job?.id ?? "unknown"}`, error);
});

matchingWorker.on("failed", (job, error) => {
  console.error(`[worker] matching run failed job=${job?.id ?? "unknown"}`, error);
});

async function start() {
  await Promise.all([resumeWorker.waitUntilReady(), matchingWorker.waitUntilReady()]);
  console.log(
    `[worker] ready. queues=${QUEUE_NAMES.resumeParsing},${QUEUE_NAMES.matchingRuns} concurrency=${env.WORKER_CONCURRENCY}`
  );
}

async function shutdown(signal: NodeJS.Signals) {
  console.log(`[worker] received ${signal}. shutting down...`);
  await Promise.all([resumeWorker.close(), matchingWorker.close()]);
  await connection.quit();
  await pool.end();
  process.exit(0);
}

start().catch((error) => {
  console.error("[worker] startup failed.", error);
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
