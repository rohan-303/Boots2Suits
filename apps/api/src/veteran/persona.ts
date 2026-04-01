import { createHash } from "node:crypto";

type ProfileInput = {
  fullName: string | null;
  militaryBranch: string | null;
  mosCode: string | null;
  mosTitle: string | null;
  highestRank: string | null;
  yearsOfService: number | null;
  responsibilitiesSummary: string | null;
  keySkills: string[];
  toolsTechnologies: string[];
  leadershipExperience: string | null;
  industriesOfInterest: string[];
  desiredRoles: string[];
  preferredIndustries: string[];
};

type PersonaOutput = {
  summary: string;
  strengths: string[];
  roleClusters: string[];
  experienceLevel: string;
  leadershipProfile: string;
  technicalProfile: string;
  suggestedJobTitles: string[];
  modelVersion: string;
  sourceSnapshotHash: string;
};

function normalize(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0)
    .map((v) => v.toLowerCase());
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function experienceLevel(yearsOfService: number | null) {
  if (!yearsOfService || yearsOfService < 2) return "entry";
  if (yearsOfService < 6) return "mid";
  if (yearsOfService < 10) return "senior";
  return "principal";
}

function mapRoleClusters(input: ProfileInput) {
  const clusters = new Set<string>();
  const mos = (input.mosCode ?? "").toLowerCase();
  const skills = normalize(input.keySkills);
  const tools = normalize(input.toolsTechnologies);
  const interests = normalize(input.industriesOfInterest);

  if (["11b", "19d"].includes(mos) || skills.some((s) => s.includes("operations"))) {
    clusters.add("operations-leadership");
  }
  if (["25b", "17c"].includes(mos) || skills.some((s) => s.includes("it") || s.includes("network"))) {
    clusters.add("technical-support");
  }
  if (["2t2x1", "92a", "88n"].includes(mos) || skills.some((s) => s.includes("logistics"))) {
    clusters.add("logistics-coordination");
  }
  if (
    skills.some((s) => s.includes("leadership") || s.includes("training")) ||
    (input.leadershipExperience ?? "").length > 0
  ) {
    clusters.add("team-development");
  }
  if (tools.some((t) => t.includes("excel") || t.includes("power bi"))) {
    clusters.add("data-informed-operations");
  }
  if (interests.some((i) => i.includes("technology"))) {
    clusters.add("technology-operations");
  }

  if (clusters.size === 0) {
    clusters.add("general-operations");
  }

  return [...clusters];
}

function buildStrengths(input: ProfileInput, clusters: string[]) {
  const strengths = new Set<string>();
  const skills = normalize(input.keySkills);

  if ((input.yearsOfService ?? 0) >= 6) strengths.add("sustained performance in high-accountability environments");
  if ((input.leadershipExperience ?? "").length > 0) strengths.add("people leadership and team coordination");
  if (skills.some((s) => s.includes("planning") || s.includes("execution"))) {
    strengths.add("structured planning and execution discipline");
  }
  if (clusters.includes("technical-support")) strengths.add("technical troubleshooting and systems support");
  if (clusters.includes("logistics-coordination")) strengths.add("logistics and resource coordination");
  if (clusters.includes("operations-leadership")) strengths.add("mission-focused operational leadership");

  if (strengths.size === 0) strengths.add("adaptable problem solving in dynamic environments");
  return [...strengths];
}

function suggestedTitles(input: ProfileInput, clusters: string[]) {
  const desired = unique(normalize(input.desiredRoles));
  const seeded: string[] = [];

  if (clusters.includes("operations-leadership")) {
    seeded.push("operations manager", "program operations lead");
  }
  if (clusters.includes("technical-support")) {
    seeded.push("it support engineer", "technical operations specialist");
  }
  if (clusters.includes("logistics-coordination")) {
    seeded.push("logistics operations lead", "supply chain coordinator");
  }
  if (clusters.includes("team-development")) {
    seeded.push("training and development manager");
  }

  return unique([...desired, ...seeded]).slice(0, 8);
}

export function generateOverallVeteranPersona(input: ProfileInput): PersonaOutput {
  const clusters = mapRoleClusters(input);
  const strengths = buildStrengths(input, clusters);
  const level = experienceLevel(input.yearsOfService);
  const titles = suggestedTitles(input, clusters);

  const leadershipProfile =
    input.leadershipExperience && input.leadershipExperience.trim().length > 0
      ? `Demonstrates leadership through ${input.leadershipExperience.trim()}.`
      : "Leadership evidence is emerging; recommend highlighting formal team ownership examples.";

  const technicalSignals = unique([
    ...normalize(input.keySkills).filter((s) => s.includes("system") || s.includes("network") || s.includes("analysis")),
    ...normalize(input.toolsTechnologies)
  ]);
  const technicalProfile =
    technicalSignals.length > 0
      ? `Technical profile includes ${technicalSignals.slice(0, 4).join(", ")}.`
      : "Technical profile is operations-oriented with limited explicit tool stack evidence.";

  const summary = [
    input.fullName ? `${input.fullName} is a ${level}-level veteran professional.` : "Veteran professional profile.",
    input.mosTitle ? `Military background includes ${input.mosTitle}${input.mosCode ? ` (${input.mosCode})` : ""}.` : "Military occupation details provided.",
    `Primary role clusters: ${clusters.join(", ")}.`,
    `Top strengths: ${strengths.slice(0, 3).join("; ")}.`
  ].join(" ");

  const sourcePayload = JSON.stringify({
    fullName: input.fullName,
    branch: input.militaryBranch,
    mosCode: input.mosCode,
    mosTitle: input.mosTitle,
    rank: input.highestRank,
    years: input.yearsOfService,
    responsibilities: input.responsibilitiesSummary,
    keySkills: normalize(input.keySkills),
    tools: normalize(input.toolsTechnologies),
    leadership: input.leadershipExperience,
    industries: normalize(input.industriesOfInterest),
    desiredRoles: normalize(input.desiredRoles),
    preferredIndustries: normalize(input.preferredIndustries)
  });

  const sourceSnapshotHash = createHash("sha256").update(sourcePayload).digest("hex");

  return {
    summary,
    strengths,
    roleClusters: clusters,
    experienceLevel: level,
    leadershipProfile,
    technicalProfile,
    suggestedJobTitles: titles,
    modelVersion: "persona-rule-v1",
    sourceSnapshotHash
  };
}

