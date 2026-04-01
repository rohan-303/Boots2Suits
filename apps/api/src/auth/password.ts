import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(plainPassword: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plainPassword, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(plainPassword: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) {
    return false;
  }

  const derived = scryptSync(plainPassword, salt, KEY_LENGTH).toString("hex");
  return timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(hash, "hex"));
}

