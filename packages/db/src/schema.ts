import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["veteran", "employer", "admin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "inactive"]);
export const companySizeEnum = pgEnum("company_size", [
  "startup",
  "small",
  "mid_market",
  "enterprise"
]);
export const militaryBranchEnum = pgEnum("military_branch", [
  "army",
  "navy",
  "air_force",
  "marines",
  "space_force",
  "coast_guard",
  "national_guard",
  "other"
]);
export const personaScopeEnum = pgEnum("persona_scope", [
  "overall",
  "leadership",
  "technical",
  "culture"
]);
export const employmentTypeEnum = pgEnum("employment_type", [
  "full_time",
  "part_time",
  "contract",
  "internship"
]);
export const locationTypeEnum = pgEnum("location_type", ["onsite", "hybrid", "remote"]);
export const jobStatusEnum = pgEnum("job_status", ["draft", "published", "closed"]);
export const applicationStatusEnum = pgEnum("application_status", [
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn"
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    fullName: text("full_name"),
    role: userRoleEnum("role").notNull().default("veteran"),
    status: userStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    usersEmailUnique: unique("users_email_unique").on(table.email),
    usersRoleIdx: index("idx_users_role").on(table.role),
    usersCreatedAtIdx: index("idx_users_created_at").on(table.createdAt)
  })
);

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    name: text("name").notNull(),
    websiteUrl: text("website_url"),
    headquarters: text("headquarters"),
    industry: text("industry"),
    size: companySizeEnum("size").default("small"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    companiesNameIdx: index("idx_companies_name").on(table.name),
    companiesOwnerIdx: index("idx_companies_owner_user_id").on(table.ownerUserId)
  })
);

export const veteranProfiles = pgTable(
  "veteran_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    headline: text("headline"),
    militaryBranch: militaryBranchEnum("military_branch"),
    yearsOfService: integer("years_of_service"),
    locationCity: text("location_city"),
    locationState: text("location_state"),
    resumeText: text("resume_text"),
    civilianSummary: text("civilian_summary"),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    veteranProfilesUserUnique: unique("veteran_profiles_user_unique").on(table.userId),
    veteranProfilesBranchIdx: index("idx_veteran_profiles_military_branch").on(
      table.militaryBranch
    ),
    veteranProfilesLocationIdx: index("idx_veteran_profiles_location").on(
      table.locationState,
      table.locationCity
    )
  })
);

export const veteranPersonas = pgTable(
  "veteran_personas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    veteranProfileId: uuid("veteran_profile_id")
      .notNull()
      .references(() => veteranProfiles.id, { onDelete: "cascade" }),
    scope: personaScopeEnum("scope").notNull().default("overall"),
    summary: text("summary").notNull(),
    strengths: jsonb("strengths"),
    gaps: jsonb("gaps"),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    veteranPersonaScopeUnique: unique("veteran_persona_scope_unique").on(
      table.veteranProfileId,
      table.scope
    ),
    veteranPersonasProfileIdx: index("idx_veteran_personas_profile_id").on(table.veteranProfileId)
  })
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    postedByUserId: uuid("posted_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    title: text("title").notNull(),
    locationCity: text("location_city"),
    locationState: text("location_state"),
    locationType: locationTypeEnum("location_type").notNull().default("onsite"),
    employmentType: employmentTypeEnum("employment_type").notNull().default("full_time"),
    status: jobStatusEnum("status").notNull().default("draft"),
    compensationMin: integer("compensation_min"),
    compensationMax: integer("compensation_max"),
    currency: text("currency").default("USD"),
    description: text("description").notNull(),
    requirements: text("requirements"),
    embedding: vector("embedding", { dimensions: 1536 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    jobsCompanyIdx: index("idx_jobs_company_id").on(table.companyId),
    jobsStatusIdx: index("idx_jobs_status").on(table.status),
    jobsLocationIdx: index("idx_jobs_location").on(table.locationState, table.locationCity),
    jobsPublishedAtIdx: index("idx_jobs_published_at").on(table.publishedAt)
  })
);

export const jobPersonas = pgTable(
  "job_personas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    scope: personaScopeEnum("scope").notNull().default("overall"),
    summary: text("summary").notNull(),
    requiredTraits: jsonb("required_traits"),
    preferredTraits: jsonb("preferred_traits"),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    jobPersonaScopeUnique: unique("job_persona_scope_unique").on(table.jobId, table.scope),
    jobPersonasJobIdx: index("idx_job_personas_job_id").on(table.jobId)
  })
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    veteranProfileId: uuid("veteran_profile_id")
      .notNull()
      .references(() => veteranProfiles.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: applicationStatusEnum("status").notNull().default("applied"),
    source: text("source"),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    applicationsUnique: unique("applications_unique_veteran_job").on(
      table.veteranProfileId,
      table.jobId
    ),
    applicationsStatusIdx: index("idx_applications_status").on(table.status),
    applicationsJobIdx: index("idx_applications_job_id").on(table.jobId)
  })
);

export const candidateJobScores = pgTable(
  "candidate_job_scores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    veteranProfileId: uuid("veteran_profile_id")
      .notNull()
      .references(() => veteranProfiles.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    algorithmVersion: text("algorithm_version").notNull().default("v1"),
    score: numeric("score", { precision: 7, scale: 6 }).notNull(),
    semanticScore: numeric("semantic_score", { precision: 7, scale: 6 }),
    ruleScore: numeric("rule_score", { precision: 7, scale: 6 }),
    explanation: text("explanation").notNull(),
    explanationData: jsonb("explanation_data"),
    rank: integer("rank"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    candidateScoreUnique: unique("candidate_job_scores_unique").on(
      table.veteranProfileId,
      table.jobId,
      table.algorithmVersion
    ),
    candidateScoreJobIdx: index("idx_candidate_job_scores_job_id_score").on(
      table.jobId,
      table.score
    ),
    candidateScoreVeteranIdx: index("idx_candidate_job_scores_veteran_id_score").on(
      table.veteranProfileId,
      table.score
    ),
    candidateScoreRankIdx: index("idx_candidate_job_scores_rank").on(table.rank)
  })
);

