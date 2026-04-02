import { Redis } from "ioredis";

let redisConnection: Redis | null = null;

export function getRedisConnection(redisUrl: string) {
  if (!redisConnection) {
    redisConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null
    });
  }
  return redisConnection;
}

export async function closeRedisConnection() {
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
  }
}
