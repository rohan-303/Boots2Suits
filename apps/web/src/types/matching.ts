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
