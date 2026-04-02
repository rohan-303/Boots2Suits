export const SERVICE_NAMES = {
  web: "web",
  api: "api",
  worker: "worker"
} as const;

export type ServiceName = (typeof SERVICE_NAMES)[keyof typeof SERVICE_NAMES];

export const QUEUE_NAMES = {
  resumeParsing: "resume-parsing",
  matchingRuns: "matching-runs"
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export type ResumeParsingJobPayload = {
  documentId: string;
  veteranProfileId: string;
};

export type MatchingRunJobPayload = {
  matchRunId: string;
  jobId: string;
  requestedByUserId: string;
};
