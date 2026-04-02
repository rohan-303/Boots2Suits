export type VeteranProfile = {
  id: string;
  userId: string;
  militaryBranch: string | null;
  mosCode: string | null;
  mosTitle: string | null;
  highestRank: string | null;
  yearsOfService: number | null;
  serviceStartDate: string | null;
  serviceEndDate: string | null;
  clearanceLevel: string | null;
  workAuthorization: string | null;
  relocationPreference: string | null;
  responsibilitiesSummary: string | null;
  keySkills: string[] | null;
  toolsTechnologies: string[] | null;
  leadershipExperience: string | null;
  industriesOfInterest: string[] | null;
  desiredRoles: string[] | null;
  preferredIndustries: string[] | null;
  salaryExpectationMin: number | null;
  salaryExpectationMax: number | null;
  preferredWorkModes: Array<"remote" | "hybrid" | "onsite"> | null;
  locationCity: string | null;
  locationState: string | null;
  profileCompletedAt: string | null;
  translationVersion: string | null;
  translationConfidence: string | null;
};

export type VeteranPersona = {
  id?: string;
  scope: "overall";
  summary: string;
  strengths: string[] | null;
  roleClusters: string[] | null;
  experienceLevel: string | null;
  leadershipProfile: string | null;
  technicalProfile: string | null;
  suggestedJobTitles: string[] | null;
  modelVersion: string | null;
  sourceSnapshotHash: string | null;
  updatedAt?: string;
};

export type VeteranResume = {
  id: string;
  originalFilename: string;
  parseStatus: "pending" | "processing" | "completed" | "failed";
  parseConfidence: string | null;
  parserVersion: string | null;
  parseError: string | null;
  parsedData: {
    summary?: string;
    experience?: string[];
    education?: string[];
    certifications?: string[];
    skills?: string[];
  } | null;
  uploadedAt: string;
  parsedAt: string | null;
};

export type MilitaryOccupationSearchResult = {
  id: string;
  militaryBranch: string;
  mosCode: string;
  mosTitle: string;
  civilianEquivalentTitle: string | null;
  description: string | null;
};
