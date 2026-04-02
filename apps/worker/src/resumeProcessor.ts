import fs from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { PDFParse } from "pdf-parse";
import { createDbClient, veteranDocuments, veteranProfiles } from "@boots2suits/db";

type Db = ReturnType<typeof createDbClient>["db"];

type ParsedResume = {
  rawText: string;
  summary: string | null;
  experience: string[];
  education: string[];
  certifications: string[];
  skills: string[];
  confidence: number;
};

type VeteranProfileLike = {
  responsibilitiesSummary: string | null;
  leadershipExperience: string | null;
  keySkills: unknown;
  toolsTechnologies: unknown;
  desiredRoles: unknown;
  civilianSummary: string | null;
  translationConfidence: string | null;
};

function cleanLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

function dedupe(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function inferDesiredRolesFromResume(parsed: ParsedResume) {
  const text = `${parsed.summary ?? ""} ${parsed.experience.slice(0, 10).join(" ")}`.toLowerCase();
  const roles: string[] = [];
  if (text.includes("operations")) roles.push("operations manager");
  if (text.includes("logistics")) roles.push("logistics coordinator");
  if (text.includes("program")) roles.push("program manager");
  if (text.includes("support")) roles.push("support specialist");
  if (text.includes("security")) roles.push("security operations specialist");
  return unique(roles);
}

function buildSafeProfileEnrichment(current: VeteranProfileLike, parsed: ParsedResume) {
  const updates: {
    responsibilitiesSummary?: string;
    leadershipExperience?: string;
    keySkills?: string[];
    toolsTechnologies?: string[];
    desiredRoles?: string[];
    civilianSummary?: string;
    translationConfidence?: string;
    translationVersion?: string;
  } = {};

  const existingSkills = asStringArray(current.keySkills);
  const existingTools = asStringArray(current.toolsTechnologies);
  const existingDesiredRoles = asStringArray(current.desiredRoles);

  const mergedSkills = unique([...existingSkills, ...parsed.skills.slice(0, 15)]);
  if (mergedSkills.length > existingSkills.length) {
    updates.keySkills = mergedSkills;
  }

  const inferredTools = parsed.skills.filter((skill) =>
    ["excel", "python", "sql", "power bi", "tableau", "jira", "servicenow"].some((tool) =>
      skill.toLowerCase().includes(tool)
    )
  );
  const mergedTools = unique([...existingTools, ...inferredTools]);
  if (mergedTools.length > existingTools.length) {
    updates.toolsTechnologies = mergedTools;
  }

  if (!current.responsibilitiesSummary && parsed.experience.length > 0) {
    updates.responsibilitiesSummary = parsed.experience.slice(0, 3).join(" ");
  }

  if (!current.leadershipExperience) {
    const leadershipLine = parsed.experience.find((line) =>
      /(led|managed|supervised|trained|commanded)/i.test(line)
    );
    if (leadershipLine) {
      updates.leadershipExperience = leadershipLine;
    }
  }

  const inferredRoles = inferDesiredRolesFromResume(parsed);
  const mergedRoles = unique([...existingDesiredRoles, ...inferredRoles]);
  if (mergedRoles.length > existingDesiredRoles.length) {
    updates.desiredRoles = mergedRoles;
  }

  if (!current.civilianSummary && parsed.summary) {
    updates.civilianSummary = parsed.summary;
  }

  const existingConfidence = current.translationConfidence ? Number(current.translationConfidence) : 0;
  if (parsed.confidence > existingConfidence) {
    updates.translationConfidence = parsed.confidence.toFixed(3);
    updates.translationVersion = "resume-parse-v1";
  }

  return updates;
}

async function extractPdfText(fileBuffer: Buffer) {
  const parser = new PDFParse({ data: fileBuffer });
  try {
    const textResult = await parser.getText();
    return textResult.text ?? "";
  } finally {
    await parser.destroy();
  }
}

function parseResumeText(rawText: string): ParsedResume {
  const sectionPatterns: Array<{
    key: "summary" | "experience" | "education" | "certifications" | "skills";
    regex: RegExp;
  }> = [
    { key: "summary", regex: /^(summary|objective|professional summary)$/i },
    { key: "experience", regex: /^(experience|work experience|professional experience)$/i },
    { key: "education", regex: /^(education|academic background)$/i },
    { key: "certifications", regex: /^(certifications|licenses|credentials)$/i },
    { key: "skills", regex: /^(skills|technical skills|core competencies)$/i }
  ];

  const lines = rawText
    .split(/\r?\n/g)
    .map(cleanLine)
    .filter((line) => line.length > 0);

  const buckets = {
    summary: [] as string[],
    experience: [] as string[],
    education: [] as string[],
    certifications: [] as string[],
    skills: [] as string[],
    other: [] as string[]
  };

  let active: keyof typeof buckets = "other";
  for (const line of lines) {
    const heading = sectionPatterns.find((pattern) => pattern.regex.test(line));
    if (heading) {
      active = heading.key;
      continue;
    }
    buckets[active].push(line);
  }

  const summary = buckets.summary.length > 0 ? buckets.summary.slice(0, 4).join(" ") : null;
  const experience = dedupe(buckets.experience).slice(0, 25);
  const education = dedupe(buckets.education).slice(0, 15);
  const certifications = dedupe(buckets.certifications).slice(0, 15);
  const skills = (() => {
    const rawSkillBlock =
      buckets.skills.length > 0
        ? buckets.skills.join(", ")
        : buckets.experience.filter((line) => line.length < 80).join(", ");
    return dedupe(
      rawSkillBlock
        .split(/[,\u2022|]/g)
        .map(cleanLine)
        .filter((item) => item.length > 1)
    ).slice(0, 40);
  })();

  const confidenceSignals = [
    summary ? 1 : 0,
    experience.length > 0 ? 1 : 0,
    education.length > 0 ? 1 : 0,
    certifications.length > 0 ? 1 : 0,
    skills.length > 0 ? 1 : 0
  ];
  const confidence = confidenceSignals.reduce((a, b) => a + b, 0) / confidenceSignals.length;

  return {
    rawText,
    summary,
    experience,
    education,
    certifications,
    skills,
    confidence: Number(confidence.toFixed(3))
  };
}

export async function processResumeParsingJob(
  db: Db,
  payload: { documentId: string; veteranProfileId: string }
) {
  const [document] = await db
    .select({
      id: veteranDocuments.id,
      veteranProfileId: veteranDocuments.veteranProfileId,
      storagePath: veteranDocuments.storagePath,
      parseStatus: veteranDocuments.parseStatus
    })
    .from(veteranDocuments)
    .where(
      and(
        eq(veteranDocuments.id, payload.documentId),
        eq(veteranDocuments.veteranProfileId, payload.veteranProfileId),
        eq(veteranDocuments.documentType, "resume")
      )
    )
    .limit(1);

  if (!document) {
    return;
  }

  if (document.parseStatus === "completed") {
    return;
  }

  await db
    .update(veteranDocuments)
    .set({
      parseStatus: "processing",
      parseError: null
    })
    .where(eq(veteranDocuments.id, document.id));

  try {
    const [profile] = await db
      .select({
        id: veteranProfiles.id,
        responsibilitiesSummary: veteranProfiles.responsibilitiesSummary,
        leadershipExperience: veteranProfiles.leadershipExperience,
        keySkills: veteranProfiles.keySkills,
        toolsTechnologies: veteranProfiles.toolsTechnologies,
        desiredRoles: veteranProfiles.desiredRoles,
        civilianSummary: veteranProfiles.civilianSummary,
        translationConfidence: veteranProfiles.translationConfidence
      })
      .from(veteranProfiles)
      .where(eq(veteranProfiles.id, document.veteranProfileId))
      .limit(1);
    if (!profile) {
      throw new Error("Veteran profile not found for resume parse.");
    }

    const fileBuffer = await fs.readFile(document.storagePath);
    const rawText = await extractPdfText(fileBuffer);
    const parsed = parseResumeText(rawText);
    const enrichment = buildSafeProfileEnrichment(profile, parsed);
    const now = new Date();

    await db
      .update(veteranProfiles)
      .set({
        resumeText: rawText || null,
        ...enrichment,
        updatedAt: now
      })
      .where(eq(veteranProfiles.id, profile.id));

    await db
      .update(veteranDocuments)
      .set({
        parseStatus: "completed",
        parseConfidence: parsed.confidence.toFixed(3),
        parserVersion: "pdf-parse-v1",
        parsedData: {
          summary: parsed.summary,
          experience: parsed.experience,
          education: parsed.education,
          certifications: parsed.certifications,
          skills: parsed.skills
        },
        parseError: null,
        parsedAt: now
      })
      .where(eq(veteranDocuments.id, document.id));
  } catch (error) {
    await db
      .update(veteranDocuments)
      .set({
        parseStatus: "failed",
        parseError: error instanceof Error ? error.message : "Resume parsing failed.",
        parsedAt: new Date()
      })
      .where(eq(veteranDocuments.id, document.id));

    throw error;
  }
}
