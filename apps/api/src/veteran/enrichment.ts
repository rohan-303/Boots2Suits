import type { ParsedResume } from "./resumeParser.js";

type VeteranProfileLike = {
  responsibilitiesSummary: string | null;
  leadershipExperience: string | null;
  keySkills: unknown;
  toolsTechnologies: unknown;
  desiredRoles: unknown;
  civilianSummary: string | null;
  translationConfidence: string | null;
};

type EnrichmentOutput = {
  responsibilitiesSummary?: string;
  leadershipExperience?: string;
  keySkills?: string[];
  toolsTechnologies?: string[];
  desiredRoles?: string[];
  civilianSummary?: string;
  translationConfidence?: string;
  translationVersion?: string;
};

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

export function buildSafeProfileEnrichment(
  current: VeteranProfileLike,
  parsed: ParsedResume
): EnrichmentOutput {
  const updates: EnrichmentOutput = {};
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
