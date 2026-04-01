import { createHash } from "node:crypto";

type JobInput = {
  title: string;
  department: string | null;
  locationType: "onsite" | "hybrid" | "remote";
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  requiredExperienceLevel: string | null;
  clearanceRequirement: string | null;
  travelRequirement: string | null;
  description: string;
};

type JobPersona = {
  summary: string;
  leadershipLevel: string;
  executionVsStrategy: string;
  environmentType: string;
  technicalDepth: string;
  suggestedCandidateArchetypes: string[];
  prioritySignals: string[];
  disqualifiers: string[];
  suggestedRoleFamily: string;
  modelVersion: string;
  sourceSnapshotHash: string;
};

function normalize(items: string[]) {
  return [...new Set(items.map((x) => x.trim().toLowerCase()).filter(Boolean))];
}

function inferLeadershipLevel(input: JobInput) {
  const title = input.title.toLowerCase();
  if (title.includes("director") || title.includes("head")) return "high";
  if (title.includes("manager") || title.includes("lead")) return "medium";
  return "individual_contributor";
}

function inferExecutionVsStrategy(input: JobInput) {
  const text = `${input.title} ${input.description}`.toLowerCase();
  if (text.includes("strategy") || text.includes("roadmap")) return "strategy-leaning";
  if (text.includes("execution") || text.includes("operations")) return "execution-leaning";
  return "balanced";
}

function inferTechnicalDepth(input: JobInput) {
  const mustSkills = normalize(input.mustHaveSkills);
  if (mustSkills.some((s) => s.includes("kubernetes") || s.includes("distributed systems"))) return "advanced";
  if (mustSkills.some((s) => s.includes("sql") || s.includes("network") || s.includes("python"))) return "intermediate";
  return "light";
}

function inferRoleFamily(input: JobInput) {
  const text = `${input.title} ${input.department ?? ""}`.toLowerCase();
  if (text.includes("operations") || text.includes("program")) return "operations";
  if (text.includes("support") || text.includes("it")) return "technical-support";
  if (text.includes("logistics") || text.includes("supply")) return "logistics";
  return "general-business";
}

export function generateJobPersona(input: JobInput): JobPersona {
  const mustSkills = normalize(input.mustHaveSkills);
  const niceSkills = normalize(input.niceToHaveSkills);
  const leadershipLevel = inferLeadershipLevel(input);
  const executionVsStrategy = inferExecutionVsStrategy(input);
  const technicalDepth = inferTechnicalDepth(input);
  const roleFamily = inferRoleFamily(input);

  const prioritySignals = [
    ...mustSkills.slice(0, 5),
    input.requiredExperienceLevel ? `experience:${input.requiredExperienceLevel}` : "",
    input.clearanceRequirement ? `clearance:${input.clearanceRequirement}` : "",
    `location:${input.locationType}`
  ].filter(Boolean);

  const disqualifiers = [
    mustSkills.length > 0 ? "missing core must-have skills" : "",
    input.clearanceRequirement && input.clearanceRequirement !== "none"
      ? "cannot satisfy clearance requirement"
      : "",
    input.travelRequirement && input.travelRequirement.toLowerCase().includes("frequent")
      ? "cannot meet travel expectations"
      : ""
  ].filter(Boolean);

  const archetypes =
    roleFamily === "operations"
      ? ["operations veteran leader", "program execution specialist"]
      : roleFamily === "technical-support"
      ? ["mission-driven support engineer", "systems reliability specialist"]
      : roleFamily === "logistics"
      ? ["logistics coordinator", "supply chain operator"]
      : ["structured cross-functional professional"];

  const summary = [
    `${input.title} persona favors ${executionVsStrategy.replace("-", " ")} work.`,
    `Leadership expectation is ${leadershipLevel}.`,
    `Technical depth is ${technicalDepth}.`,
    `Primary role family: ${roleFamily}.`
  ].join(" ");

  const sourcePayload = JSON.stringify({
    title: input.title,
    department: input.department,
    locationType: input.locationType,
    mustHaveSkills: mustSkills,
    niceToHaveSkills: niceSkills,
    requiredExperienceLevel: input.requiredExperienceLevel,
    clearanceRequirement: input.clearanceRequirement,
    travelRequirement: input.travelRequirement,
    description: input.description
  });

  return {
    summary,
    leadershipLevel,
    executionVsStrategy,
    environmentType: input.locationType,
    technicalDepth,
    suggestedCandidateArchetypes: archetypes,
    prioritySignals,
    disqualifiers,
    suggestedRoleFamily: roleFamily,
    modelVersion: "job-persona-rule-v1",
    sourceSnapshotHash: createHash("sha256").update(sourcePayload).digest("hex")
  };
}

