import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  candidateJobScoreFeatures,
  candidateJobScores,
  companies,
  createDbClient,
  jobs,
  users,
  veteranProfiles
} from "@boots2suits/db";

function getArgValue(args: string[], key: string) {
  const idx = args.findIndex((arg) => arg === key);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required for matching inspect")
});

function toNum(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return null;
}

async function inspectPair(db: ReturnType<typeof createDbClient>["db"], jobId: string, veteranProfileId: string) {
  const [scoreRow] = await db
    .select({
      id: candidateJobScores.id,
      matchRunId: candidateJobScores.matchRunId,
      score: candidateJobScores.score,
      semanticScore: candidateJobScores.semanticScore,
      ruleScore: candidateJobScores.ruleScore,
      rank: candidateJobScores.rank,
      explanation: candidateJobScores.explanation,
      explanationData: candidateJobScores.explanationData
    })
    .from(candidateJobScores)
    .where(and(eq(candidateJobScores.jobId, jobId), eq(candidateJobScores.veteranProfileId, veteranProfileId)))
    .orderBy(desc(candidateJobScores.createdAt))
    .limit(1);

  if (!scoreRow) {
    console.log("No score found for this veteran/job pair.");
    return;
  }

  const featureRows = await db
    .select({
      featureName: candidateJobScoreFeatures.featureName,
      featureWeight: candidateJobScoreFeatures.featureWeight,
      featureValue: candidateJobScoreFeatures.featureValue,
      featureImpact: candidateJobScoreFeatures.featureImpact,
      reasonCode: candidateJobScoreFeatures.reasonCode,
      displayOrder: candidateJobScoreFeatures.displayOrder
    })
    .from(candidateJobScoreFeatures)
    .where(eq(candidateJobScoreFeatures.candidateJobScoreId, scoreRow.id))
    .orderBy(candidateJobScoreFeatures.displayOrder);

  console.log(`Pair Inspection: job=${jobId} veteranProfile=${veteranProfileId}`);
  console.log(`Match run: ${scoreRow.matchRunId}`);
  const explanationMeta =
    scoreRow.explanationData && typeof scoreRow.explanationData === "object"
      ? (scoreRow.explanationData as {
          semanticMode?: string;
          embeddingModelVersion?: string;
          embeddingSimilarity?: number | null;
        })
      : null;
  if (explanationMeta) {
    console.log(
      `Semantic mode: ${explanationMeta.semanticMode ?? "unknown"} | embedding model: ${explanationMeta.embeddingModelVersion ?? "n/a"} | embedding similarity: ${explanationMeta.embeddingSimilarity ?? "n/a"}`
    );
  }
  console.log(`Score: ${toNum(scoreRow.score)} | semantic: ${toNum(scoreRow.semanticScore)} | rule: ${toNum(scoreRow.ruleScore)} | rank: ${scoreRow.rank}`);
  console.log(`Explanation: ${scoreRow.explanation}`);
  console.log("Features:");
  for (const feature of featureRows) {
    console.log(
      `- ${feature.featureName} impact=${toNum(feature.featureImpact)} weight=${toNum(feature.featureWeight)} value=${feature.featureValue ?? "-"} reason=${feature.reasonCode ?? "-"}`
    );
  }
}

async function inspectJobRanking(db: ReturnType<typeof createDbClient>["db"], jobId: string) {
  const [latest] = await db
    .select({
      matchRunId: candidateJobScores.matchRunId
    })
    .from(candidateJobScores)
    .where(eq(candidateJobScores.jobId, jobId))
    .orderBy(desc(candidateJobScores.createdAt))
    .limit(1);

  if (!latest) {
    console.log("No ranking found for this job.");
    return;
  }

  const rows = await db
    .select({
      veteranProfileId: candidateJobScores.veteranProfileId,
      rank: candidateJobScores.rank,
      score: candidateJobScores.score,
      userFullName: users.fullName,
      userEmail: users.email
    })
    .from(candidateJobScores)
    .innerJoin(veteranProfiles, eq(veteranProfiles.id, candidateJobScores.veteranProfileId))
    .innerJoin(users, eq(users.id, veteranProfiles.userId))
    .where(and(eq(candidateJobScores.jobId, jobId), eq(candidateJobScores.matchRunId, latest.matchRunId)))
    .orderBy(candidateJobScores.rank, desc(candidateJobScores.score));

  console.log(`Job Ranking: job=${jobId} run=${latest.matchRunId}`);
  for (const row of rows) {
    console.log(
      `#${row.rank ?? "-"} ${row.userFullName ?? "candidate"} (${row.userEmail}) veteranProfile=${row.veteranProfileId} score=${toNum(row.score)}`
    );
  }
}

async function inspectVeteranRanking(db: ReturnType<typeof createDbClient>["db"], veteranProfileId: string) {
  const [latest] = await db
    .select({
      matchRunId: candidateJobScores.matchRunId
    })
    .from(candidateJobScores)
    .where(eq(candidateJobScores.veteranProfileId, veteranProfileId))
    .orderBy(desc(candidateJobScores.createdAt))
    .limit(1);

  if (!latest) {
    console.log("No ranking found for this veteran profile.");
    return;
  }

  const rows = await db
    .select({
      jobId: candidateJobScores.jobId,
      rank: candidateJobScores.rank,
      score: candidateJobScores.score,
      title: jobs.title,
      companyName: companies.name
    })
    .from(candidateJobScores)
    .innerJoin(jobs, eq(jobs.id, candidateJobScores.jobId))
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(
      and(
        eq(candidateJobScores.veteranProfileId, veteranProfileId),
        eq(candidateJobScores.matchRunId, latest.matchRunId)
      )
    )
    .orderBy(candidateJobScores.rank, desc(candidateJobScores.score));

  console.log(`Veteran Ranking: veteranProfile=${veteranProfileId} run=${latest.matchRunId}`);
  for (const row of rows) {
    console.log(
      `#${row.rank ?? "-"} ${row.title} @ ${row.companyName} job=${row.jobId} score=${toNum(row.score)}`
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  const env = envSchema.parse(process.env);
  const { db, pool } = createDbClient(env.DATABASE_URL);

  try {
    if (mode === "pair") {
      const jobId = getArgValue(args, "--jobId");
      const veteranProfileId = getArgValue(args, "--veteranProfileId");
      if (!jobId || !veteranProfileId) {
        throw new Error("Usage: npm run match:inspect -- pair --jobId <id> --veteranProfileId <id>");
      }
      await inspectPair(db, jobId, veteranProfileId);
      return;
    }

    if (mode === "job") {
      const jobId = getArgValue(args, "--jobId");
      if (!jobId) {
        throw new Error("Usage: npm run match:inspect -- job --jobId <id>");
      }
      await inspectJobRanking(db, jobId);
      return;
    }

    if (mode === "veteran") {
      const veteranProfileId = getArgValue(args, "--veteranProfileId");
      if (!veteranProfileId) {
        throw new Error("Usage: npm run match:inspect -- veteran --veteranProfileId <id>");
      }
      await inspectVeteranRanking(db, veteranProfileId);
      return;
    }

    throw new Error(
      "Unknown mode. Use one of: pair, job, veteran. Example: npm run match:inspect -- job --jobId <id>"
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Matching inspect failed:", error);
  process.exit(1);
});
