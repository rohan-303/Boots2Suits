export type EmployerContactPreferences = {
  preferredChannel: "email" | "phone" | "slack" | "teams";
  responseWindow?: string;
};

export type EmployerProfile = {
  id: string;
  ownerUserId: string | null;
  name: string;
  size: "startup" | "small" | "mid_market" | "enterprise" | null;
  industry: string | null;
  websiteUrl: string | null;
  headquarters: string | null;
  hiringRoles: string[];
  hiringVolume: string | null;
  veteranHiringPriority: boolean | null;
  clearanceSensitiveRoles: boolean | null;
  hiringRegions: string[];
  recruiterTitle: string | null;
  recruiterTeam: string | null;
  contactPreferences: EmployerContactPreferences | null;
  profileCompletedAt: string | null;
  recruiterName: string | null;
};

export type EmployerJob = {
  id: string;
  title: string;
  department: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationType: "onsite" | "hybrid" | "remote";
  employmentType: "full_time" | "part_time" | "contract" | "internship";
  status: "draft" | "published" | "closed";
  compensationMin: number | null;
  compensationMax: number | null;
  currency: string | null;
  requiredExperienceLevel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployerJobDetail = EmployerJob & {
  companyId: string;
  description: string;
  requirements: string | null;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  clearanceRequirement: string | null;
  travelRequirement: string | null;
};

export type JobPersona = {
  id?: string;
  scope: "overall";
  summary: string;
  leadershipLevel: string | null;
  executionVsStrategy: string | null;
  environmentType: string | null;
  technicalDepth: string | null;
  suggestedCandidateArchetypes: string[];
  prioritySignals: string[];
  disqualifiers: string[];
  suggestedRoleFamily: string | null;
  modelVersion: string | null;
  sourceSnapshotHash: string | null;
  updatedAt?: string;
};

export type JobCandidateExportSummary = {
  id: string;
  exportStatus: "pending" | "exported" | "failed";
  exportTarget: string;
  exportFormat: "json" | "csv" | string;
  externalSource: string | null;
  externalId: string | null;
  candidateCount: number;
  exportedByUserId: string | null;
  createdAt: string;
  exportedAt: string | null;
  errorMessage: string | null;
};

export type JobCandidateExportItem = {
  veteranProfileId: string;
  applicationId: string | null;
  matchRunId: string | null;
  matchScore: number | null;
  rank: number | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type JobCandidateExportDetail = {
  export: JobCandidateExportSummary & {
    payload: Record<string, unknown> | null;
    jobId: string;
  };
  items: JobCandidateExportItem[];
};
