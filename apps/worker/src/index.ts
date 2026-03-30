import IORedis from "ioredis";
import { Queue } from "bullmq";
import { z } from "zod";

const envSchema = z.object({
  REDIS_URL: z.string().url().default("redis://localhost:6379")
});

const env = envSchema.parse(process.env);
const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

const bootstrapQueue = new Queue("bootstrap", { connection });

async function start() {
  await bootstrapQueue.waitUntilReady();
  console.log("Worker connected to Redis and queue is ready.");
}

start().catch((error) => {
  console.error("Worker startup failed.", error);
  process.exit(1);
});

