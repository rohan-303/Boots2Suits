import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";
import { QUEUE_NAMES, apiLogger } from "@boots2suits/shared";
import { asyncJobDeadLetters, createDbClient } from "@boots2suits/db";
import { desc, ne } from "drizzle-orm";

const envSchema = z.object({
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required")
});

const env = envSchema.parse(process.env);

async function inspectQueue(name: string, redisUrl: string) {
  const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
    retryStrategy: () => null
  });
  connection.on("error", () => {
    // Prevent ioredis from writing noisy unstructured logs during inspection failures.
  });
  const queue = new Queue(name, { connection });
  const counts = await queue.getJobCounts("waiting", "active", "failed", "delayed", "completed");
  const failed = await queue.getJobs(["failed"], 0, 4, true);
  await queue.close();
  await connection.quit();

  return {
    queue: name,
    counts,
    recentFailed: failed.map((job) => ({
      id: String(job.id),
      name: job.name,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason ?? null,
      timestamp: job.timestamp ?? null
    }))
  };
}

async function main() {
  const { db, pool } = createDbClient(env.DATABASE_URL);
  const results = await Promise.all([
    inspectQueue(QUEUE_NAMES.resumeParsing, env.REDIS_URL),
    inspectQueue(QUEUE_NAMES.matchingRuns, env.REDIS_URL),
    inspectQueue(QUEUE_NAMES.embeddingGeneration, env.REDIS_URL),
    inspectQueue(QUEUE_NAMES.connectorExports, env.REDIS_URL)
  ]);
  const recentDeadLetters = await db
    .select({
      id: asyncJobDeadLetters.id,
      queueName: asyncJobDeadLetters.queueName,
      jobName: asyncJobDeadLetters.jobName,
      failureStatus: asyncJobDeadLetters.failureStatus,
      errorType: asyncJobDeadLetters.errorType,
      errorMessage: asyncJobDeadLetters.errorMessage,
      attemptsMade: asyncJobDeadLetters.attemptsMade,
      maxAttempts: asyncJobDeadLetters.maxAttempts,
      replayCount: asyncJobDeadLetters.replayCount,
      failedAt: asyncJobDeadLetters.failedAt,
      lastReplayAt: asyncJobDeadLetters.lastReplayAt,
      lastReplayJobId: asyncJobDeadLetters.lastReplayJobId
    })
    .from(asyncJobDeadLetters)
    .where(ne(asyncJobDeadLetters.failureStatus, "resolved"))
    .orderBy(desc(asyncJobDeadLetters.failedAt))
    .limit(20);

  apiLogger.info("queue.inspect", {
    action: "queue_inspect",
    status: "success",
    queues: results,
    deadLetters: recentDeadLetters.length
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        inspectedAt: new Date().toISOString(),
        queues: results,
        deadLetters: recentDeadLetters
      },
      null,
      2
    )
  );
  await pool.end();
}

main().catch((error) => {
  apiLogger.error("queue.inspect", error, {
    action: "queue_inspect",
    status: "fail"
  });
  process.exit(1);
});
