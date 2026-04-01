import { and, desc, eq } from "drizzle-orm";
import {
  applicationEvents,
  applications,
  createDbClient,
  veteranProfiles
} from "@boots2suits/db";

type Db = ReturnType<typeof createDbClient>["db"];

export const ACTIVE_APPLICATION_STATUSES = ["drafted", "applied", "reviewed", "shortlisted"] as const;
export type WorkflowApplicationStatus =
  | "drafted"
  | "applied"
  | "reviewed"
  | "shortlisted"
  | "rejected"
  | "closed";

export function isActiveApplicationStatus(status: string) {
  return ACTIVE_APPLICATION_STATUSES.includes(status as (typeof ACTIVE_APPLICATION_STATUSES)[number]);
}

export async function getVeteranProfileByUserId(db: Db, userId: string) {
  const [profile] = await db
    .select({ id: veteranProfiles.id })
    .from(veteranProfiles)
    .where(eq(veteranProfiles.userId, userId))
    .limit(1);
  return profile ?? null;
}

export async function getLatestApplicationForPair(
  db: Db,
  veteranProfileId: string,
  jobId: string
) {
  const [application] = await db
    .select({
      id: applications.id,
      status: applications.status,
      appliedAt: applications.appliedAt
    })
    .from(applications)
    .where(
      and(eq(applications.veteranProfileId, veteranProfileId), eq(applications.jobId, jobId))
    )
    .orderBy(desc(applications.appliedAt))
    .limit(1);

  return application ?? null;
}

export async function createApplicationWithEvent(input: {
  db: Db;
  veteranProfileId: string;
  jobId: string;
  status: WorkflowApplicationStatus;
  source: string;
  createdByUserId: string;
  note?: string;
  reasonCode?: string;
}) {
  const now = new Date();
  return input.db.transaction(async (tx) => {
    const [created] = await tx
      .insert(applications)
      .values({
        veteranProfileId: input.veteranProfileId,
        jobId: input.jobId,
        status: input.status,
        source: input.source,
        appliedAt: now,
        updatedAt: now
      })
      .returning({
        id: applications.id,
        status: applications.status,
        appliedAt: applications.appliedAt
      });

    await tx.insert(applicationEvents).values({
      applicationId: created.id,
      eventType: "created",
      fromStatus: null,
      toStatus: input.status,
      reasonCode: input.reasonCode ?? "application_created",
      note: input.note ?? null,
      createdByUserId: input.createdByUserId,
      occurredAt: now,
      createdAt: now
    });

    return created;
  });
}

export async function transitionApplicationStatus(input: {
  db: Db;
  applicationId: string;
  fromStatus: WorkflowApplicationStatus | string;
  toStatus: WorkflowApplicationStatus;
  createdByUserId: string;
  reasonCode: string;
  note?: string;
}) {
  const now = new Date();
  await input.db.transaction(async (tx) => {
    await tx
      .update(applications)
      .set({
        status: input.toStatus,
        updatedAt: now
      })
      .where(eq(applications.id, input.applicationId));

    await tx.insert(applicationEvents).values({
      applicationId: input.applicationId,
      eventType: "status_changed",
      fromStatus: input.fromStatus as never,
      toStatus: input.toStatus as never,
      reasonCode: input.reasonCode,
      note: input.note ?? null,
      createdByUserId: input.createdByUserId,
      occurredAt: now,
      createdAt: now
    });
  });
}
