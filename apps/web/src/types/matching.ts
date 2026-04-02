export type MatchRunStatus = "queued" | "running" | "completed" | "failed";

export type MatchRunMeta = {
  id: string;
  status: MatchRunStatus;
  algorithmVersion: string;
  embeddingModelVersion: string;
  scoreVersion: string;
  explanationVersion: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
};

export type MatchFeature = {
  featureName: string;
  featureWeight: number | null;
  featureValue: string | null;
  featureImpact: number | null;
  reasonCode: string | null;
};

export type EmployerMatchResult = {
  veteranProfileId: string;
  candidate: {
    fullName: string | null;
    email: string;
    locationCity: string | null;
    locationState: string | null;
    militaryBranch: string | null;
    mosCode: string | null;
    keySkills: string[];
    desiredRoles: string[];
    personaSummary: string | null;
  };
  score: number | null;
  semanticScore: number | null;
  ruleScore: number | null;
  rank: number | null;
  explanation: string;
  explanationBullets: string[];
  explanationData: unknown;
  topFeatures: MatchFeature[];
  application: {
    id: string;
    status: string;
    updatedAt: string;
  } | null;
};

export type VeteranRecommendation = {
  jobId: string;
  job: {
    title: string;
    department: string | null;
    locationType: string;
    locationCity: string | null;
    locationState: string | null;
    status: string;
    companyName: string;
    jobPersonaSummary: string | null;
  };
  score: number | null;
  semanticScore: number | null;
  ruleScore: number | null;
  rank: number | null;
  explanation: string;
  explanationBullets: string[];
  explanationData: unknown;
  topFeatures: MatchFeature[];
  application: {
    id: string;
    status: string;
    updatedAt: string;
  } | null;
};

export type EmployerCandidateDetail = {
  candidate: {
    veteranProfileId: string;
    fullName: string | null;
    headline: string;
    location: {
      city: string | null;
      state: string | null;
      preferredWorkModes: string[];
    };
    militaryTranslation: {
      branch: string | null;
      mosCode: string | null;
      mosTitle: string | null;
      highestRank: string | null;
      yearsOfService: number | null;
      translationVersion: string | null;
      translationConfidence: string | null;
      occupationHistory: Array<{
        mosCode: string;
        mosTitle: string;
        civilianEquivalentTitle: string | null;
        startDate: string | null;
        endDate: string | null;
        isPrimary: boolean;
      }>;
    };
    profileSummary: {
      responsibilitiesSummary: string | null;
      keySkills: string[];
      desiredRoles: string[];
      clearanceLevel: string | null;
      salaryExpectationMin: number | null;
      salaryExpectationMax: number | null;
    };
    persona: {
      summary: string | null;
      strengths: string[];
      roleClusters: string[];
      suggestedJobTitles: string[];
      experienceLevel: string | null;
      leadershipProfile: string | null;
      technicalProfile: string | null;
    };
    resumeSignals: {
      parserVersion: string | null;
      parseConfidence: string | null;
      summary: string | null;
      topSkills: string[];
      certifications: string[];
    } | null;
  };
  jobContext: {
    id: string;
    title: string;
    department: string | null;
    requiredExperienceLevel: string | null;
    clearanceRequirement: string | null;
  };
  match: {
    rank: number | null;
    score: number | null;
    semanticScore: number | null;
    ruleScore: number | null;
    explanation: string;
    explanationBullets: string[];
    components: Record<string, number>;
    topFeatures: MatchFeature[];
  } | null;
  evidence: {
    skillOverlap: {
      matchedMustHave: string[];
      missingMustHave: string[];
      matchedNiceToHave: string[];
      missingNiceToHave: string[];
    };
    fitSummaries: {
      leadership: string;
      clearance: string;
      location: string;
      compensation: string;
    };
    strengths: string[];
    likelyGaps: string[];
  };
  application: {
    id: string;
    status: string;
    appliedAt: string;
    updatedAt: string;
    recentEvents: Array<{
      eventType: string;
      fromStatus: string | null;
      toStatus: string | null;
      reasonCode: string | null;
      note: string | null;
      occurredAt: string;
    }>;
  } | null;
};
