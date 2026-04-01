import { and, eq, ilike, or } from "drizzle-orm";
import { Router } from "express";
import { createDbClient, militaryOccupations } from "@boots2suits/db";
import { buildAuthMiddleware } from "../auth/middleware.js";

type Db = ReturnType<typeof createDbClient>["db"];

type MilitaryRouterOptions = {
  db: Db;
  cookieName: string;
  tokenPepper: string;
};

export function createMilitaryRouter(options: MilitaryRouterOptions) {
  const router = Router();
  const auth = buildAuthMiddleware({
    db: options.db,
    cookieName: options.cookieName,
    tokenPepper: options.tokenPepper
  });

  router.use(auth.optionalAuth);
  router.use(auth.requireRole(["veteran", "employer", "admin"]));

  router.get("/occupations/search", async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    const branch = String(req.query.branch ?? "").trim().toLowerCase();
    const limit = Math.min(Number(req.query.limit ?? 15), 30);

    if (!q || q.length < 2) {
      return res.json({ ok: true, occupations: [] });
    }

    const validBranches = new Set([
      "army",
      "navy",
      "air_force",
      "marines",
      "space_force",
      "coast_guard",
      "national_guard",
      "other"
    ]);

    const whereClause = validBranches.has(branch)
      ? and(
          eq(
            militaryOccupations.militaryBranch,
            branch as
              | "army"
              | "navy"
              | "air_force"
              | "marines"
              | "space_force"
              | "coast_guard"
              | "national_guard"
              | "other"
          ),
          or(
            ilike(militaryOccupations.mosCode, `%${q}%`),
            ilike(militaryOccupations.mosTitle, `%${q}%`),
            ilike(militaryOccupations.civilianEquivalentTitle, `%${q}%`)
          )
        )
      : or(
          ilike(militaryOccupations.mosCode, `%${q}%`),
          ilike(militaryOccupations.mosTitle, `%${q}%`),
          ilike(militaryOccupations.civilianEquivalentTitle, `%${q}%`)
        );

    const occupations = await options.db
      .select({
        id: militaryOccupations.id,
        militaryBranch: militaryOccupations.militaryBranch,
        mosCode: militaryOccupations.mosCode,
        mosTitle: militaryOccupations.mosTitle,
        civilianEquivalentTitle: militaryOccupations.civilianEquivalentTitle,
        description: militaryOccupations.description
      })
      .from(militaryOccupations)
      .where(whereClause)
      .limit(limit);

    return res.json({ ok: true, occupations });
  });

  return router;
}
