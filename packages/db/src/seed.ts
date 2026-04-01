import { eq } from "drizzle-orm";
import { createDbClient } from "./client.js";
import {
  applicationEvents,
  applications,
  candidateJobScoreFeatures,
  candidateJobScores,
  companies,
  jobPersonas,
  jobs,
  matchRuns,
  militaryOccupations,
  users,
  veteranOccupationHistory,
  veteranPersonas,
  veteranProfiles
} from "./schema.js";

const ids = {
  user: {
    v1: "9f05d95b-c2f4-4d0a-bf5e-5f0af3f1a111",
    v2: "522518f6-94f0-4f57-b4fd-f7bde6a9a222",
    v3: "4936ed8d-c6db-4cb4-a77e-6de3be67a333",
    e1: "6f46d6ec-6623-48a3-91c2-f93213cb2444",
    e2: "2ba31526-f440-47ea-8166-33deecde3555"
  },
  company: {
    c1: "196f8c9f-9539-490a-857f-93263effa666",
    c2: "95b5bf76-e6eb-46be-a6af-846f60823777"
  },
  mos: {
    m1: "87e31dc5-045d-4f6f-bb26-421b66b93881",
    m2: "2337a9ec-89d5-4786-9925-c6ce0c31d882",
    m3: "95f4164d-ad0d-4ff9-8d11-4b8bdf3d9883",
    m4: "853bf3ab-a716-44ab-a0ee-e29f45569884"
  },
  profile: {
    p1: "d2e705c8-269d-4bf4-a43f-df77e93f2991",
    p2: "4317f62d-af75-4f3f-a98d-3efac2ead992",
    p3: "6dd2f65b-a7f0-45de-8914-cbe367714993"
  },
  persona: {
    vp1: "de1daebe-b3ec-47bf-a03b-b13d835f1a01",
    vp2: "8afdd359-4bf6-45ec-a09f-8c60fd11f102",
    vp3: "1c4174cc-e2b0-4d73-bcd6-dce29d87e103"
  },
  job: {
    j1: "4af30457-c0d5-4eb6-ae53-3f8eb72ec201",
    j2: "f9a8a266-68f0-4d6d-9f60-a95a094bb202",
    j3: "f46b4729-e7a5-4418-b66b-a127baaaf203",
    j4: "c57bba3f-3f5c-4a31-b161-8ec1ec4a8204"
  },
  jp: {
    jp1: "6158f3e1-9d84-44a0-baf3-ba26aee35211",
    jp2: "42d9cfcf-3f7a-4dcc-bf78-f3f86afb5212",
    jp3: "3b5c7744-5ae8-4b0b-940e-49959a78f213",
    jp4: "8319e6cb-cf1c-49e4-a55f-cf9f73e7c214"
  },
  app: {
    a1: "956a782f-c676-48b4-aeaa-20bcd1de7301",
    a2: "c0d3377c-796b-43e2-a5e5-ca93d9ff7302",
    a3: "5c7558b7-5889-40d0-9e32-434f82d07303",
    a4: "8320283b-2815-4df2-81f1-9ad27f177304"
  },
  run: { r1: "77a3d4d4-30f8-4ffc-b8a4-7f5f24dd7f01" },
  score: {
    s1: "a17d3350-3994-4d08-8b2f-693a95a1c101",
    s2: "f6ca7de0-e25d-4f8a-a266-cb8302de6102",
    s3: "be87016f-f744-46af-95aa-b5af96ca4103",
    s4: "3765c111-f8b5-4522-939f-aa57bb856104",
    s5: "bb950b37-e6ec-4e74-8163-af82d2ce7105",
    s6: "80d2992e-a4f4-4418-ac53-7b4d8ea7f106"
  }
} as const;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const { db, pool } = createDbClient(databaseUrl);
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(users)
        .values([
          { id: ids.user.v1, email: "alex@boots2suits.dev", fullName: "Alex Mercer", role: "veteran", externalId: "cand-1001", externalSource: "greenhouse", syncStatus: "synced" },
          { id: ids.user.v2, email: "brooke@boots2suits.dev", fullName: "Brooke Santiago", role: "veteran", externalId: "cand-1002", externalSource: "greenhouse", syncStatus: "synced" },
          { id: ids.user.v3, email: "chris@boots2suits.dev", fullName: "Chris Nguyen", role: "veteran", externalId: "cand-1003", externalSource: "greenhouse", syncStatus: "pending" },
          { id: ids.user.e1, email: "morgan@northstar.dev", fullName: "Morgan Lee", role: "employer", externalId: "rec-2001", externalSource: "lever", syncStatus: "synced" },
          { id: ids.user.e2, email: "taylor@atlas.dev", fullName: "Taylor James", role: "employer", externalId: "rec-2002", externalSource: "lever", syncStatus: "synced" }
        ])
        .onConflictDoNothing();

      await tx
        .insert(companies)
        .values([
          { id: ids.company.c1, ownerUserId: ids.user.e1, name: "Northstar Defense Technologies", headquarters: "Arlington, VA", industry: "Defense Technology", size: "mid_market", externalId: "co-3001", externalSource: "lever", syncStatus: "synced" },
          { id: ids.company.c2, ownerUserId: ids.user.e2, name: "Atlas Logistics Group", headquarters: "Nashville, TN", industry: "Supply Chain", size: "enterprise", externalId: "co-3002", externalSource: "lever", syncStatus: "synced" }
        ])
        .onConflictDoNothing();

      await tx
        .insert(militaryOccupations)
        .values([
          { id: ids.mos.m1, militaryBranch: "army", mosCode: "11B", mosTitle: "Infantryman", civilianEquivalentTitle: "Operations Supervisor" },
          { id: ids.mos.m2, militaryBranch: "army", mosCode: "68W", mosTitle: "Combat Medic Specialist", civilianEquivalentTitle: "Emergency Care Coordinator" },
          { id: ids.mos.m3, militaryBranch: "army", mosCode: "25B", mosTitle: "IT Specialist", civilianEquivalentTitle: "IT Support Engineer" },
          { id: ids.mos.m4, militaryBranch: "air_force", mosCode: "2T2X1", mosTitle: "Air Transportation Specialist", civilianEquivalentTitle: "Logistics Coordinator" }
        ])
        .onConflictDoNothing();

      await tx
        .insert(veteranProfiles)
        .values([
          { id: ids.profile.p1, userId: ids.user.v1, militaryBranch: "army", mosCode: "11B", mosTitle: "Infantryman", highestRank: "E-6", clearanceLevel: "secret", yearsOfService: 8, serviceStartDate: "2014-06-01", serviceEndDate: "2022-05-30", dischargeType: "honorable", locationCity: "Austin", locationState: "TX", civilianSummary: "Operations leader transitioning into civilian program operations.", translationConfidence: "0.934", translationVersion: "trans-v1.2" },
          { id: ids.profile.p2, userId: ids.user.v2, militaryBranch: "army", mosCode: "25B", mosTitle: "IT Specialist", highestRank: "E-5", clearanceLevel: "secret", yearsOfService: 6, serviceStartDate: "2016-02-15", serviceEndDate: "2022-02-14", dischargeType: "honorable", locationCity: "Raleigh", locationState: "NC", civilianSummary: "Technical support specialist with strong incident response habits.", translationConfidence: "0.962", translationVersion: "trans-v1.2" },
          { id: ids.profile.p3, userId: ids.user.v3, militaryBranch: "air_force", mosCode: "2T2X1", mosTitle: "Air Transportation Specialist", highestRank: "E-6", clearanceLevel: "confidential", yearsOfService: 9, serviceStartDate: "2013-09-01", serviceEndDate: "2022-09-01", dischargeType: "honorable", locationCity: "Nashville", locationState: "TN", civilianSummary: "Logistics planner with throughput and dispatch coordination experience.", translationConfidence: "0.918", translationVersion: "trans-v1.2" }
        ])
        .onConflictDoNothing();

      await tx.insert(veteranOccupationHistory).values([
        { id: "8b39eb58-5ec8-46d5-ae6e-fb8ea3897a01", veteranProfileId: ids.profile.p1, militaryOccupationId: ids.mos.m1, mosCode: "11B", mosTitle: "Infantryman", startDate: "2014-06-01", endDate: "2019-12-31", isPrimary: true },
        { id: "43f0d65b-c35b-4ec4-b10f-ce97e68b6a02", veteranProfileId: ids.profile.p2, militaryOccupationId: ids.mos.m3, mosCode: "25B", mosTitle: "IT Specialist", startDate: "2016-02-15", endDate: "2022-02-14", isPrimary: true },
        { id: "4a7af4c6-cf4a-4dc9-8ca0-7e534f264003", veteranProfileId: ids.profile.p3, militaryOccupationId: ids.mos.m4, mosCode: "2T2X1", mosTitle: "Air Transportation Specialist", startDate: "2013-09-01", endDate: "2022-09-01", isPrimary: true }
      ]).onConflictDoNothing();

      await tx.insert(veteranPersonas).values([
        { id: ids.persona.vp1, veteranProfileId: ids.profile.p1, scope: "overall", summary: "Disciplined operations leader with mission planning strengths.", strengths: ["planning", "team leadership"], gaps: ["corporate budgeting"] },
        { id: ids.persona.vp2, veteranProfileId: ids.profile.p2, scope: "overall", summary: "Reliable technical support operator with user-first communication.", strengths: ["incident triage", "documentation"], gaps: ["cloud architecture depth"] },
        { id: ids.persona.vp3, veteranProfileId: ids.profile.p3, scope: "overall", summary: "Logistics coordinator with strong capacity and dispatch planning.", strengths: ["resource coordination", "SLA tracking"], gaps: ["ERP certification"] }
      ]).onConflictDoNothing();

      await tx.insert(jobs).values([
        { id: ids.job.j1, companyId: ids.company.c1, postedByUserId: ids.user.e1, title: "Operations Program Manager", locationCity: "Austin", locationState: "TX", locationType: "hybrid", employmentType: "full_time", status: "published", compensationMin: 90000, compensationMax: 125000, description: "Lead operations planning and execution.", requirements: "Leadership and process ownership.", externalId: "job-4001", externalSource: "lever", syncStatus: "synced" },
        { id: ids.job.j2, companyId: ids.company.c1, postedByUserId: ids.user.e1, title: "IT Support Engineer", locationCity: "Raleigh", locationState: "NC", locationType: "remote", employmentType: "full_time", status: "published", compensationMin: 70000, compensationMax: 98000, description: "Resolve incidents and improve support workflows.", requirements: "Troubleshooting and incident handling.", externalId: "job-4002", externalSource: "lever", syncStatus: "synced" },
        { id: ids.job.j3, companyId: ids.company.c2, postedByUserId: ids.user.e2, title: "Logistics Operations Lead", locationCity: "Nashville", locationState: "TN", locationType: "onsite", employmentType: "full_time", status: "published", compensationMin: 80000, compensationMax: 115000, description: "Own transportation flow and dispatch planning.", requirements: "Supply chain planning and reporting.", externalId: "job-4003", externalSource: "lever", syncStatus: "synced" },
        { id: ids.job.j4, companyId: ids.company.c2, postedByUserId: ids.user.e2, title: "Veteran Transition Program Manager", locationCity: "Washington", locationState: "DC", locationType: "hybrid", employmentType: "full_time", status: "published", compensationMin: 95000, compensationMax: 130000, description: "Run veteran onboarding and mentoring outcomes.", requirements: "Program leadership and stakeholder alignment.", externalId: "job-4004", externalSource: "lever", syncStatus: "synced" }
      ]).onConflictDoNothing();

      await tx.insert(jobPersonas).values([
        { id: ids.jp.jp1, jobId: ids.job.j1, scope: "overall", summary: "Needs execution-focused leadership.", requiredTraits: ["planning", "cross-team communication"], preferredTraits: ["defense domain"] },
        { id: ids.jp.jp2, jobId: ids.job.j2, scope: "technical", summary: "Needs pragmatic troubleshooting and support discipline.", requiredTraits: ["incident triage", "documentation"], preferredTraits: ["endpoint management"] },
        { id: ids.jp.jp3, jobId: ids.job.j3, scope: "overall", summary: "Needs logistics coordination under constraints.", requiredTraits: ["dispatch", "throughput planning"], preferredTraits: ["military logistics background"] },
        { id: ids.jp.jp4, jobId: ids.job.j4, scope: "culture", summary: "Needs empathetic veteran-program leadership.", requiredTraits: ["mentorship", "program ownership"], preferredTraits: ["workforce transition experience"] }
      ]).onConflictDoNothing();

      await tx.insert(applications).values([
        { id: ids.app.a1, veteranProfileId: ids.profile.p1, jobId: ids.job.j1, status: "interview", source: "boots2suits", externalId: "app-5001", externalSource: "lever", syncStatus: "synced" },
        { id: ids.app.a2, veteranProfileId: ids.profile.p2, jobId: ids.job.j2, status: "screening", source: "boots2suits", externalId: "app-5002", externalSource: "lever", syncStatus: "synced" },
        { id: ids.app.a3, veteranProfileId: ids.profile.p3, jobId: ids.job.j3, status: "applied", source: "boots2suits", externalId: "app-5003", externalSource: "lever", syncStatus: "pending" },
        { id: ids.app.a4, veteranProfileId: ids.profile.p1, jobId: ids.job.j4, status: "screening", source: "boots2suits", externalId: "app-5004", externalSource: "lever", syncStatus: "pending" }
      ]).onConflictDoNothing();

      await tx.insert(applicationEvents).values([
        { id: "7524f8c4-9857-45c5-a9f6-a3734266a401", applicationId: ids.app.a1, eventType: "created", toStatus: "applied", reasonCode: "candidate_submitted", createdByUserId: ids.user.v1 },
        { id: "91f6bcc0-596e-4e31-a155-6e16f5f0f402", applicationId: ids.app.a1, eventType: "status_changed", fromStatus: "applied", toStatus: "interview", reasonCode: "screen_pass", createdByUserId: ids.user.e1 },
        { id: "91c05350-fdf3-4b77-b51e-84ca45042c403", applicationId: ids.app.a2, eventType: "status_changed", fromStatus: "applied", toStatus: "screening", reasonCode: "fit_high", createdByUserId: ids.user.e1 },
        { id: "4f32198f-bc78-4bbf-bf17-f43ad0946704", applicationId: ids.app.a3, eventType: "sync", toStatus: "applied", reasonCode: "ats_pending", createdByUserId: ids.user.e2 },
        { id: "2f7f6f18-e47d-4f5a-9f5f-f87a9e2ffb05", applicationId: ids.app.a4, eventType: "note", toStatus: "screening", reasonCode: "panel_review", createdByUserId: ids.user.e2 }
      ]).onConflictDoNothing();

      await tx.insert(matchRuns).values([
        { id: ids.run.r1, algorithmVersion: "hybrid-v1", embeddingModelVersion: "text-embedding-3-large", rerankerVersion: "boots2suits-rerank-v1", calibrationVersion: "calib-2026-04", scoreVersion: "score-v1", explanationVersion: "explain-v1", inputFingerprint: "seed-run-2026-04-01", sourceSnapshotHash: "seed-snapshot-001" }
      ]).onConflictDoNothing();

      await tx.insert(candidateJobScores).values([
        { id: ids.score.s1, veteranProfileId: ids.profile.p1, jobId: ids.job.j1, matchRunId: ids.run.r1, algorithmVersion: "hybrid-v1", embeddingModelVersion: "text-embedding-3-large", rerankerVersion: "boots2suits-rerank-v1", calibrationVersion: "calib-2026-04", scoreVersion: "score-v1", explanationVersion: "explain-v1", inputFingerprint: "seed-run-2026-04-01", sourceSnapshotHash: "seed-snapshot-001", score: "0.912000", semanticScore: "0.884000", ruleScore: "0.940000", explanation: "Strong fit from leadership semantics plus tenure and clearance rules.", rank: 1 },
        { id: ids.score.s2, veteranProfileId: ids.profile.p1, jobId: ids.job.j4, matchRunId: ids.run.r1, algorithmVersion: "hybrid-v1", embeddingModelVersion: "text-embedding-3-large", rerankerVersion: "boots2suits-rerank-v1", calibrationVersion: "calib-2026-04", scoreVersion: "score-v1", explanationVersion: "explain-v1", inputFingerprint: "seed-run-2026-04-01", sourceSnapshotHash: "seed-snapshot-001", score: "0.861000", semanticScore: "0.835000", ruleScore: "0.887000", explanation: "Good fit with mentoring alignment; slight gap on direct program ownership.", rank: 2 },
        { id: ids.score.s3, veteranProfileId: ids.profile.p2, jobId: ids.job.j2, matchRunId: ids.run.r1, algorithmVersion: "hybrid-v1", embeddingModelVersion: "text-embedding-3-large", rerankerVersion: "boots2suits-rerank-v1", calibrationVersion: "calib-2026-04", scoreVersion: "score-v1", explanationVersion: "explain-v1", inputFingerprint: "seed-run-2026-04-01", sourceSnapshotHash: "seed-snapshot-001", score: "0.905000", semanticScore: "0.923000", ruleScore: "0.887000", explanation: "Excellent technical fit from incident handling and clearance.", rank: 1 },
        { id: ids.score.s4, veteranProfileId: ids.profile.p2, jobId: ids.job.j1, matchRunId: ids.run.r1, algorithmVersion: "hybrid-v1", embeddingModelVersion: "text-embedding-3-large", rerankerVersion: "boots2suits-rerank-v1", calibrationVersion: "calib-2026-04", scoreVersion: "score-v1", explanationVersion: "explain-v1", inputFingerprint: "seed-run-2026-04-01", sourceSnapshotHash: "seed-snapshot-001", score: "0.702000", semanticScore: "0.740000", ruleScore: "0.664000", explanation: "Moderate fit; leadership scope smaller than target role.", rank: 4 },
        { id: ids.score.s5, veteranProfileId: ids.profile.p3, jobId: ids.job.j3, matchRunId: ids.run.r1, algorithmVersion: "hybrid-v1", embeddingModelVersion: "text-embedding-3-large", rerankerVersion: "boots2suits-rerank-v1", calibrationVersion: "calib-2026-04", scoreVersion: "score-v1", explanationVersion: "explain-v1", inputFingerprint: "seed-run-2026-04-01", sourceSnapshotHash: "seed-snapshot-001", score: "0.896000", semanticScore: "0.878000", ruleScore: "0.914000", explanation: "Strong logistics fit from semantic overlap plus tenure rules.", rank: 1 },
        { id: ids.score.s6, veteranProfileId: ids.profile.p3, jobId: ids.job.j4, matchRunId: ids.run.r1, algorithmVersion: "hybrid-v1", embeddingModelVersion: "text-embedding-3-large", rerankerVersion: "boots2suits-rerank-v1", calibrationVersion: "calib-2026-04", scoreVersion: "score-v1", explanationVersion: "explain-v1", inputFingerprint: "seed-run-2026-04-01", sourceSnapshotHash: "seed-snapshot-001", score: "0.781000", semanticScore: "0.768000", ruleScore: "0.794000", explanation: "Solid fit; mentoring-program signal is moderate.", rank: 3 }
      ]).onConflictDoNothing();

      const hasScores = await tx.select({ id: candidateJobScores.id }).from(candidateJobScores).where(eq(candidateJobScores.matchRunId, ids.run.r1));
      const scoreSet = new Set(hasScores.map((x) => x.id));
      const features = [
        ["71a39fbd-0a23-4452-99fe-8d8cae20c101", ids.score.s1, "leadership_depth", "0.320000", "Led 30-person teams", "0.410000", "LEADERSHIP_MATCH", 1],
        ["3f7f2f17-ee1f-47cb-8328-8897b570c102", ids.score.s1, "service_tenure_rule", "0.200000", "8 years service", "0.250000", "TENURE_RULE_BOOST", 2],
        ["f95f455f-db3f-4ab2-a5bf-6045b993c103", ids.score.s2, "mentorship_signal", "0.180000", "Coaching experience", "0.220000", "MENTORSHIP_MATCH", 1],
        ["c9fd3b38-2045-4273-ba32-c8acc7990104", ids.score.s2, "program_gap", "-0.120000", "Limited direct ownership", "-0.090000", "PROGRAM_GAP", 2],
        ["b26ab63a-f4d1-4cab-b6aa-9f6a48be4105", ids.score.s3, "incident_response", "0.310000", "Triage and troubleshooting", "0.360000", "INCIDENT_MATCH", 1],
        ["77f9cda4-ae70-46c0-bdc0-b2a17305d106", ids.score.s3, "clearance_rule", "0.140000", "Secret clearance", "0.140000", "CLEARANCE_BOOST", 2],
        ["8d6f9033-f95e-4906-8f5f-dbcd3238d107", ids.score.s4, "leadership_penalty", "-0.200000", "Smaller people-management scope", "-0.160000", "LEADERSHIP_GAP", 1],
        ["e55231de-86d4-4a56-9927-420743f5c108", ids.score.s4, "ops_overlap", "0.130000", "Process reliability", "0.080000", "OPS_OVERLAP", 2],
        ["981f8e4b-2e42-4eb8-b4af-511088043109", ids.score.s5, "logistics_semantic", "0.330000", "Dispatch + throughput planning", "0.400000", "DOMAIN_MATCH", 1],
        ["3c56e871-cf2f-47bb-a643-4d791f40f110", ids.score.s5, "tenure_rule", "0.180000", "9 years service", "0.190000", "TENURE_RULE_BOOST", 2],
        ["7384dbae-46a5-497e-bf07-1697d94ca111", ids.score.s6, "coordination_alignment", "0.140000", "Cross-functional coordination", "0.150000", "COORDINATION_MATCH", 1],
        ["6a0386ec-a64f-4fa3-9f5e-ef0af7fb9112", ids.score.s6, "program_penalty", "-0.100000", "Limited transition-program leadership", "-0.070000", "PROGRAM_GAP", 2]
      ] as const;
      for (const [id, scoreId, name, weight, value, impact, reason, order] of features) {
        if (!scoreSet.has(scoreId)) continue;
        await tx.insert(candidateJobScoreFeatures).values({
          id,
          candidateJobScoreId: scoreId,
          featureName: name,
          featureWeight: weight,
          featureValue: value,
          featureImpact: impact,
          reasonCode: reason,
          displayOrder: order
        }).onConflictDoNothing();
      }
    });
    console.log("Seed complete for Boots2Suits dev foundation.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Seed failed.", error);
  process.exit(1);
});

