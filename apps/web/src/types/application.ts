export type ApplicationStatus =
  | "drafted"
  | "applied"
  | "reviewed"
  | "shortlisted"
  | "rejected"
  | "closed"
  | "screening"
  | "interview"
  | "offer"
  | "hired"
  | "withdrawn";

export type ApplicationEvent = {
  applicationId: string;
  eventType: "created" | "status_changed" | "note" | "sync";
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus | null;
  reasonCode: string | null;
  note: string | null;
  occurredAt: string;
};

export type VeteranApplication = {
  id: string;
  status: ApplicationStatus;
  source: string | null;
  appliedAt: string;
  updatedAt: string;
  job: {
    id: string;
    title: string;
    companyName: string;
    locationType: "onsite" | "hybrid" | "remote";
    locationCity: string | null;
    locationState: string | null;
  };
  events: ApplicationEvent[];
};
