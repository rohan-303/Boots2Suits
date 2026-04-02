import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { scoreCandidateJobMatch } from "../matching/engine.js";
import { defaultScoringConfig } from "../matching/scoringConfig.js";
import { parseResumeText } from "../veteran/resumeParser.js";
import { createAuthRouter } from "../auth/routes.js";
import {
  createApplicationWithEvent,
  isActiveApplicationStatus,
  transitionApplicationStatus
} from "../applications/service.js";

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
};

const tests: TestCase[] = [];

function test(name: string, run: TestCase["run"]) {
  tests.push({ name, run });
}

const sampleMatchInput = {
  job: {
    id: "job-1",
    title: "Operations Program Manager",
    department: "Operations",
    locationType: "hybrid" as const,
    locationState: "TX",
    compensationMin: 90000,
    compensationMax: 120000,
    mustHaveSkills: ["operations planning", "team leadership", "program management"],
    niceToHaveSkills: ["logistics", "power bi"],
    requiredExperienceLevel: "senior",
    clearanceRequirement: "secret"
  },
  jobPersona: {
    suggestedRoleFamily: "operations",
    leadershipLevel: "medium",
    suggestedCandidateArchetypes: ["operations veteran leader"]
  },
  veteran: {
    id: "vet-1",
    userId: "user-1",
    locationState: "TX",
    preferredWorkModes: ["hybrid", "onsite"],
    yearsOfService: 10,
    clearanceLevel: "secret",
    salaryExpectationMin: 95000,
    salaryExpectationMax: 120000,
    keySkills: ["operations planning", "team leadership", "program management", "logistics"],
    desiredRoles: ["operations manager", "program manager"],
    highestRank: "Captain",
    leadershipExperience: "Led a 20-person operations team."
  },
  veteranPersona: {
    roleClusters: ["operations-leadership", "team-development"],
    suggestedJobTitles: ["operations manager"],
    leadershipProfile: "Experienced team leader.",
    experienceLevel: "senior"
  }
};

test("matching engine uses deterministic fallback without embeddings", () => {
  const result = scoreCandidateJobMatch(sampleMatchInput, defaultScoringConfig);
  assert.equal(result.explanationData.semanticMode, "rule_only_fallback");
  assert.equal(result.semanticScore, 0);
  assert.equal(result.score, result.ruleScore);
  assert.ok(result.score >= 0 && result.score <= 1);
});

test("matching engine boosts semantic score with high embedding similarity", () => {
  const low = scoreCandidateJobMatch(sampleMatchInput, defaultScoringConfig, {
    embeddingSimilarity: 0.2,
    embeddingModelVersion: "openai:text-embedding-3-small"
  });
  const high = scoreCandidateJobMatch(sampleMatchInput, defaultScoringConfig, {
    embeddingSimilarity: 0.9,
    embeddingModelVersion: "openai:text-embedding-3-small"
  });

  assert.equal(high.explanationData.semanticMode, "real_embeddings");
  assert.ok(high.semanticScore > low.semanticScore);
  assert.ok(high.score > low.score);
});

test("application workflow active-status classification is correct", () => {
  assert.equal(isActiveApplicationStatus("drafted"), true);
  assert.equal(isActiveApplicationStatus("applied"), true);
  assert.equal(isActiveApplicationStatus("reviewed"), true);
  assert.equal(isActiveApplicationStatus("shortlisted"), true);
  assert.equal(isActiveApplicationStatus("rejected"), false);
  assert.equal(isActiveApplicationStatus("closed"), false);
});

test("application creation emits created event", async () => {
  const insertedEvents: unknown[] = [];
  const tx = {
    insert() {
      return {
        values(value: unknown) {
          if (typeof value === "object" && value !== null && "eventType" in (value as Record<string, unknown>)) {
            insertedEvents.push(value);
            return {
              returning: async () => []
            };
          }
          return {
            returning: async () => [
              {
                id: "app-1",
                status: "applied",
                appliedAt: new Date("2026-04-02T00:00:00.000Z")
              }
            ]
          };
        }
      };
    },
    update() {
      throw new Error("unexpected update call");
    }
  };

  const db = {
    transaction: async <T>(cb: (trx: typeof tx) => Promise<T>) => cb(tx)
  } as unknown as Parameters<typeof createApplicationWithEvent>[0]["db"];

  const created = await createApplicationWithEvent({
    db,
    veteranProfileId: "vp-1",
    jobId: "job-1",
    status: "applied",
    source: "veteran_apply",
    createdByUserId: "user-1",
    reasonCode: "veteran_applied"
  });

  assert.equal(created.id, "app-1");
  assert.equal(insertedEvents.length, 1);
  assert.equal((insertedEvents[0] as { eventType: string }).eventType, "created");
});

test("application status transition emits status_changed event", async () => {
  let updated = false;
  let insertedStatusEvent: unknown = null;
  const tx = {
    insert() {
      return {
        values(value: unknown) {
          insertedStatusEvent = value;
          return {
            returning: async () => []
          };
        }
      };
    },
    update() {
      return {
        set() {
          return {
            where: async () => {
              updated = true;
            }
          };
        }
      };
    }
  };

  const db = {
    transaction: async <T>(cb: (trx: typeof tx) => Promise<T>) => cb(tx)
  } as unknown as Parameters<typeof transitionApplicationStatus>[0]["db"];

  await transitionApplicationStatus({
    db,
    applicationId: "app-1",
    fromStatus: "applied",
    toStatus: "reviewed",
    createdByUserId: "employer-1",
    reasonCode: "employer_reviewed_candidate"
  });

  assert.equal(updated, true);
  assert.equal((insertedStatusEvent as { eventType: string }).eventType, "status_changed");
  assert.equal((insertedStatusEvent as { toStatus: string }).toStatus, "reviewed");
});

test("resume parser extracts core sections and confidence", () => {
  const raw = `
Summary
Mission-focused veteran transitioning into civilian operations leadership.
Experience
Led cross-functional operations teams in high-tempo environments.
Managed logistics planning and execution across multiple regions.
Education
B.S. in Organizational Leadership
Certifications
PMP
Skills
operations planning, team leadership, logistics, power bi
`;
  const parsed = parseResumeText(raw);
  assert.ok(parsed.summary?.includes("Mission-focused veteran"));
  assert.ok(parsed.experience.length > 0);
  assert.ok(parsed.education[0]?.includes("Organizational Leadership"));
  assert.ok(parsed.certifications.includes("PMP"));
  assert.ok(parsed.skills.includes("operations planning"));
  assert.ok(parsed.confidence > 0.7);
});

test("auth routes reject malformed payloads", async () => {
  const app = express();
  app.use(express.json());
  app.use(
    "/auth",
    createAuthRouter({
      db: {} as never,
      cookieName: "boots2suits_session",
      cookieSecure: false,
      tokenPepper: "test-token-pepper-value",
      sessionTtlDays: 7
    })
  );

  const signup = await request(app).post("/auth/signup").send({
    email: "not-an-email",
    password: "short",
    role: "veteran"
  });
  assert.equal(signup.status, 400);

  const login = await request(app).post("/auth/login").send({
    email: "invalid-email",
    password: "tiny"
  });
  assert.equal(login.status, 400);
});

async function main() {
  let passed = 0;
  let failed = 0;

  console.log(`Running ${tests.length} API tests...`);
  for (const t of tests) {
    try {
      await t.run();
      passed += 1;
      console.log(`PASS ${t.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${t.name}`);
      console.error(error);
    }
  }

  console.log(`\nTest summary: passed=${passed} failed=${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Test runner crashed.", error);
  process.exit(1);
});
