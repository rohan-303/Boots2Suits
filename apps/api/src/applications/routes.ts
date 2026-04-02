import { and, desc, eq, inArray } from "drizzle-orm";
import { Router } from "express";
import { apiLogger } from "@boots2suits/shared";
import {
  applicationEvents,
  applications,
  companies,
  createDbClient,
  jobs
} from "@boots2suits/db";
import { z } from "zod";
import { buildAuthMiddleware, type AuthenticatedRequest } from "../auth/middleware.js";
import {
  createApplicationWithEvent,
  getLatestApplicationForPair,
  getVeteranProfileByUserId,
  isActiveApplicationStatus
} from "./service.js";

type Db = ReturnType<typeof createDbClient>["db"];

type ApplicationsRouterOptions = {
  db: Db;
  cookieName: string;
  tokenPepper: string;
};

const createApplicationSchema = z.object({
  jobId: z.string().uuid()
});

export function createApplicationsRouter(options: ApplicationsRouterOptions) {
  const router = Router();
  const auth = buildAuthMiddleware({
    db: options.db,
    cookieName: options.cookieName,
    tokenPepper: options.tokenPepper
  });

  router.use(auth.optionalAuth);

  router.post("/", auth.requireRole(["veteran", "admin"]), async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }
    const log = apiLogger.timed("application.submit", {
      action: "application_submit",
      route: "POST /applications",
      userId: authUser.id
    });

    const parsed = createApplicationSchema.safeParse(req.body);
    if (!parsed.success) {
      log.fail(new Error("Invalid application payload."));
      return res.status(400).json({ ok: false, error: "Invalid application payload." });
    }

    const profile = await getVeteranProfileByUserId(options.db, authUser.id);
    if (!profile) {
      log.fail(new Error("Veteran profile required before apply."));
      return res.status(400).json({ ok: false, error: "Veteran profile is required before applying." });
    }

    const [job] = await options.db
      .select({
        id: jobs.id,
        status: jobs.status
      })
      .from(jobs)
      .where(eq(jobs.id, parsed.data.jobId))
      .limit(1);

    if (!job) {
      log.fail(new Error("Job not found."));
      return res.status(404).json({ ok: false, error: "Job not found." });
    }

    if (job.status === "closed") {
      log.fail(new Error("Cannot apply to closed job."));
      return res.status(400).json({ ok: false, error: "Cannot apply to a closed job." });
    }

    const latest = await getLatestApplicationForPair(options.db, profile.id, parsed.data.jobId);
    if (latest && isActiveApplicationStatus(latest.status)) {
      log.fail(new Error(`Duplicate active application: ${latest.status}.`));
      return res.status(409).json({
        ok: false,
        error: `Already applied with active status: ${latest.status}.`
      });
    }

    const created = await createApplicationWithEvent({
      db: options.db,
      veteranProfileId: profile.id,
      jobId: parsed.data.jobId,
      status: "applied",
      source: "veteran_apply",
      createdByUserId: authUser.id,
      reasonCode: "veteran_applied",
      note: "Application submitted by veteran."
    });

    log.success({
      status: "success",
      jobId: parsed.data.jobId,
      applicationId: created.id
    });

    return res.status(201).json({
      ok: true,
      application: created
    });
  });

  router.get("/me", auth.requireRole(["veteran", "admin"]), async (req: AuthenticatedRequest, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      return res.status(401).json({ ok: false, error: "Authentication required." });
    }

    const profile = await getVeteranProfileByUserId(options.db, authUser.id);
    if (!profile) {
      return res.json({ ok: true, applications: [] });
    }

    const rows = await options.db
      .select({
        id: applications.id,
        jobId: applications.jobId,
        status: applications.status,
        source: applications.source,
        appliedAt: applications.appliedAt,
        updatedAt: applications.updatedAt,
        jobTitle: jobs.title,
        locationType: jobs.locationType,
        locationCity: jobs.locationCity,
        locationState: jobs.locationState,
        companyName: companies.name
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(eq(applications.veteranProfileId, profile.id))
      .orderBy(desc(applications.updatedAt));

    const appIds = rows.map((row) => row.id);
    const events =
      appIds.length === 0
        ? []
        : await options.db
            .select({
              applicationId: applicationEvents.applicationId,
              eventType: applicationEvents.eventType,
              fromStatus: applicationEvents.fromStatus,
              toStatus: applicationEvents.toStatus,
              reasonCode: applicationEvents.reasonCode,
              note: applicationEvents.note,
              occurredAt: applicationEvents.occurredAt
            })
            .from(applicationEvents)
            .where(inArray(applicationEvents.applicationId, appIds))
            .orderBy(desc(applicationEvents.occurredAt));

    const eventsByApplication = new Map<string, typeof events>();
    for (const event of events) {
      const list = eventsByApplication.get(event.applicationId) ?? [];
      list.push(event);
      eventsByApplication.set(event.applicationId, list);
    }

    return res.json({
      ok: true,
      applications: rows.map((row) => ({
        id: row.id,
        job: {
          id: row.jobId,
          title: row.jobTitle,
          companyName: row.companyName,
          locationType: row.locationType,
          locationCity: row.locationCity,
          locationState: row.locationState
        },
        status: row.status,
        source: row.source,
        appliedAt: row.appliedAt,
        updatedAt: row.updatedAt,
        events: (eventsByApplication.get(row.id) ?? []).slice(0, 8)
      }))
    });
  });

  return router;
}
