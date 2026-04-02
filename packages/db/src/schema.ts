import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
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
export const syncStatusEnum = pgEnum("sync_status", [
  "pending",
  "synced",
  "failed",
  "stale"
]);
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
export const clearanceLevelEnum = pgEnum("clearance_level", [
  "none",
  "confidential",
  "secret",
  "top_secret",
  "ts_sci",
  "other"
]);
export const dischargeTypeEnum = pgEnum("discharge_type", [
  "honorable",
  "general",
  "other_than_honorable",
  "bad_conduct",
  "dishonorable",
  "medical",
  "unknown"
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
  "drafted",
  "applied",
  "reviewed",
  "shortlisted",
  "closed",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn"
]);
export const applicationEventTypeEnum = pgEnum("application_event_type", [
  "created",
  "status_changed",
  "note",
  "sync"
]);
export const veteranDocumentTypeEnum = pgEnum("veteran_document_type", ["resume"]);
export const resumeParseStatusEnum = pgEnum("resume_parse_status", [
  "pending",
  "processing",
  "completed",
  "failed"
]);
export const matchRunStatusEnum = pgEnum("match_run_status", [
  "queued",
  "running",
  "completed",
  "failed"
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    fullName: text("full_name"),
    role: userRoleEnum("role").notNull().default("veteran"),
    status: userStatusEnum("status").notNull().default("active"),
    externalId: text("external_id"),
    externalSource: text("external_source"),
    syncStatus: syncStatusEnum("sync_status").notNull().default("pending"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    usersEmailUnique: unique("users_email_unique").on(table.email),
    usersExternalUnique: unique("users_external_unique").on(
      table.externalSource,
      table.externalId
    ),
    usersRoleIdx: index("idx_users_role").on(table.role),
    usersSyncIdx: index("idx_users_sync_status").on(table.syncStatus),
    usersCreatedAtIdx: index("idx_users_created_at").on(table.createdAt)
  })
);

export const userAuthCredentials = pgTable(
  "user_auth_credentials",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userAuthCredentialsUserIdIdx: index("idx_user_auth_credentials_user_id").on(table.userId)
  })
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    authSessionsTokenHashUnique: unique("auth_sessions_token_hash_unique").on(table.tokenHash),
    authSessionsUserIdIdx: index("idx_auth_sessions_user_id").on(table.userId),
    authSessionsExpiresAtIdx: index("idx_auth_sessions_expires_at").on(table.expiresAt),
    authSessionsRevokedAtIdx: index("idx_auth_sessions_revoked_at").on(table.revokedAt)
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
    hiringRoles: jsonb("hiring_roles"),
    hiringVolume: text("hiring_volume"),
    veteranHiringPriority: boolean("veteran_hiring_priority").default(false),
    clearanceSensitiveRoles: boolean("clearance_sensitive_roles").default(false),
    hiringRegions: jsonb("hiring_regions"),
    recruiterTitle: text("recruiter_title"),
    recruiterTeam: text("recruiter_team"),
    contactPreferences: jsonb("contact_preferences"),
    profileCompletedAt: timestamp("profile_completed_at", { withTimezone: true }),
    externalId: text("external_id"),
    externalSource: text("external_source"),
    syncStatus: syncStatusEnum("sync_status").notNull().default("pending"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    companiesExternalUnique: unique("companies_external_unique").on(
      table.externalSource,
      table.externalId
    ),
    companiesNameIdx: index("idx_companies_name").on(table.name),
    companiesSyncIdx: index("idx_companies_sync_status").on(table.syncStatus),
    companiesOwnerIdx: index("idx_companies_owner_user_id").on(table.ownerUserId)
  })
);

export const militaryOccupations = pgTable(
  "military_occupations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    militaryBranch: militaryBranchEnum("military_branch").notNull(),
    mosCode: text("mos_code").notNull(),
    mosTitle: text("mos_title").notNull(),
    civilianEquivalentTitle: text("civilian_equivalent_title"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    militaryOccupationUnique: unique("military_occupations_branch_code_unique").on(
      table.militaryBranch,
      table.mosCode
    ),
    militaryOccupationCodeIdx: index("idx_military_occupations_mos_code").on(table.mosCode),
    militaryOccupationTitleIdx: index("idx_military_occupations_mos_title").on(table.mosTitle)
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
    mosCode: text("mos_code"),
    mosTitle: text("mos_title"),
    highestRank: text("highest_rank"),
    clearanceLevel: clearanceLevelEnum("clearance_level"),
    yearsOfService: integer("years_of_service"),
    serviceStartDate: date("service_start_date"),
    serviceEndDate: date("service_end_date"),
    dischargeType: dischargeTypeEnum("discharge_type"),
    locationCity: text("location_city"),
    locationState: text("location_state"),
    workAuthorization: text("work_authorization"),
    relocationPreference: text("relocation_preference"),
    responsibilitiesSummary: text("responsibilities_summary"),
    keySkills: jsonb("key_skills"),
    toolsTechnologies: jsonb("tools_technologies"),
    leadershipExperience: text("leadership_experience"),
    industriesOfInterest: jsonb("industries_of_interest"),
    desiredRoles: jsonb("desired_roles"),
    preferredIndustries: jsonb("preferred_industries"),
    salaryExpectationMin: integer("salary_expectation_min"),
    salaryExpectationMax: integer("salary_expectation_max"),
    preferredWorkModes: jsonb("preferred_work_modes"),
    resumeText: text("resume_text"),
    civilianSummary: text("civilian_summary"),
    translationConfidence: numeric("translation_confidence", { precision: 4, scale: 3 }),
    translationVersion: text("translation_version"),
    profileCompletedAt: timestamp("profile_completed_at", { withTimezone: true }),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    veteranProfilesUserUnique: unique("veteran_profiles_user_unique").on(table.userId),
    veteranProfilesBranchIdx: index("idx_veteran_profiles_military_branch").on(
      table.militaryBranch
    ),
    veteranProfilesMosIdx: index("idx_veteran_profiles_mos_code").on(table.mosCode),
    veteranProfilesLocationIdx: index("idx_veteran_profiles_location").on(
      table.locationState,
      table.locationCity
    ),
    yearsOfServiceNonNegative: check(
      "veteran_profiles_years_of_service_nonnegative",
      sql`${table.yearsOfService} IS NULL OR ${table.yearsOfService} >= 0`
    ),
    serviceDatesValid: check(
      "veteran_profiles_service_dates_valid",
      sql`${table.serviceEndDate} IS NULL OR ${table.serviceStartDate} IS NULL OR ${table.serviceEndDate} >= ${table.serviceStartDate}`
    ),
    translationConfidenceBounds: check(
      "veteran_profiles_translation_confidence_bounds",
      sql`${table.translationConfidence} IS NULL OR (${table.translationConfidence} >= 0 AND ${table.translationConfidence} <= 1)`
    ),
    salaryExpectationValid: check(
      "veteran_profiles_salary_expectation_valid",
      sql`${table.salaryExpectationMin} IS NULL OR ${table.salaryExpectationMax} IS NULL OR ${table.salaryExpectationMin} <= ${table.salaryExpectationMax}`
    )
  })
);

export const veteranOccupationHistory = pgTable(
  "veteran_occupation_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    veteranProfileId: uuid("veteran_profile_id")
      .notNull()
      .references(() => veteranProfiles.id, { onDelete: "cascade" }),
    militaryOccupationId: uuid("military_occupation_id").references(
      () => militaryOccupations.id,
      {
        onDelete: "set null"
      }
    ),
    mosCode: text("mos_code").notNull(),
    mosTitle: text("mos_title").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    veteranOccupationHistoryProfileIdx: index("idx_veteran_occupation_history_profile_id").on(
      table.veteranProfileId
    ),
    veteranOccupationHistoryPrimaryIdx: index("idx_veteran_occupation_history_primary").on(
      table.veteranProfileId,
      table.isPrimary
    ),
    veteranOccupationDateValid: check(
      "veteran_occupation_history_dates_valid",
      sql`${table.endDate} IS NULL OR ${table.startDate} IS NULL OR ${table.endDate} >= ${table.startDate}`
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
    roleClusters: jsonb("role_clusters"),
    experienceLevel: text("experience_level"),
    leadershipProfile: text("leadership_profile"),
    technicalProfile: text("technical_profile"),
    suggestedJobTitles: jsonb("suggested_job_titles"),
    modelVersion: text("model_version"),
    embeddingModelVersion: text("embedding_model_version"),
    sourceSnapshotHash: text("source_snapshot_hash"),
    embeddedAt: timestamp("embedded_at", { withTimezone: true }),
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
    veteranPersonasProfileIdx: index("idx_veteran_personas_profile_id").on(table.veteranProfileId),
    veteranPersonasScopeIdx: index("idx_veteran_personas_scope").on(table.scope)
  })
);

export const veteranDocuments = pgTable(
  "veteran_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    veteranProfileId: uuid("veteran_profile_id")
      .notNull()
      .references(() => veteranProfiles.id, { onDelete: "cascade" }),
    documentType: veteranDocumentTypeEnum("document_type").notNull().default("resume"),
    isActive: boolean("is_active").notNull().default(true),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storagePath: text("storage_path").notNull(),
    parserVersion: text("parser_version"),
    parseStatus: resumeParseStatusEnum("parse_status").notNull().default("pending"),
    parseConfidence: numeric("parse_confidence", { precision: 4, scale: 3 }),
    parseError: text("parse_error"),
    parsedData: jsonb("parsed_data"),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    replacedByDocumentId: uuid("replaced_by_document_id"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    parsedAt: timestamp("parsed_at", { withTimezone: true })
  },
  (table) => ({
    veteranDocumentsProfileTypeIdx: index("idx_veteran_documents_profile_type").on(
      table.veteranProfileId,
      table.documentType
    ),
    veteranDocumentsActiveIdx: index("idx_veteran_documents_active").on(
      table.veteranProfileId,
      table.isActive
    ),
    veteranDocumentsUploadedByIdx: index("idx_veteran_documents_uploaded_by_user_id").on(
      table.uploadedByUserId
    ),
    parseConfidenceBounds: check(
      "veteran_documents_parse_confidence_bounds",
      sql`${table.parseConfidence} IS NULL OR (${table.parseConfidence} >= 0 AND ${table.parseConfidence} <= 1)`
    )
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
    department: text("department"),
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
    mustHaveSkills: jsonb("must_have_skills"),
    niceToHaveSkills: jsonb("nice_to_have_skills"),
    requiredExperienceLevel: text("required_experience_level"),
    clearanceRequirement: text("clearance_requirement"),
    travelRequirement: text("travel_requirement"),
    externalId: text("external_id"),
    externalSource: text("external_source"),
    syncStatus: syncStatusEnum("sync_status").notNull().default("pending"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    embedding: vector("embedding", { dimensions: 1536 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    jobsExternalUnique: unique("jobs_external_unique").on(table.externalSource, table.externalId),
    jobsCompanyIdx: index("idx_jobs_company_id").on(table.companyId),
    jobsPostedByIdx: index("idx_jobs_posted_by_user_id").on(table.postedByUserId),
    jobsStatusIdx: index("idx_jobs_status").on(table.status),
    jobsSyncIdx: index("idx_jobs_sync_status").on(table.syncStatus),
    jobsLocationIdx: index("idx_jobs_location").on(table.locationState, table.locationCity),
    jobsPublishedAtIdx: index("idx_jobs_published_at").on(table.publishedAt),
    compensationRangeValid: check(
      "jobs_compensation_range_valid",
      sql`${table.compensationMin} IS NULL OR ${table.compensationMax} IS NULL OR ${table.compensationMin} <= ${table.compensationMax}`
    )
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
    leadershipLevel: text("leadership_level"),
    executionVsStrategy: text("execution_vs_strategy"),
    environmentType: text("environment_type"),
    technicalDepth: text("technical_depth"),
    suggestedCandidateArchetypes: jsonb("suggested_candidate_archetypes"),
    prioritySignals: jsonb("priority_signals"),
    disqualifiers: jsonb("disqualifiers"),
    suggestedRoleFamily: text("suggested_role_family"),
    modelVersion: text("model_version"),
    embeddingModelVersion: text("embedding_model_version"),
    sourceSnapshotHash: text("source_snapshot_hash"),
    embeddedAt: timestamp("embedded_at", { withTimezone: true }),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    jobPersonaScopeUnique: unique("job_persona_scope_unique").on(table.jobId, table.scope),
    jobPersonasJobIdx: index("idx_job_personas_job_id").on(table.jobId),
    jobPersonasScopeIdx: index("idx_job_personas_scope").on(table.scope)
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
    externalId: text("external_id"),
    externalSource: text("external_source"),
    syncStatus: syncStatusEnum("sync_status").notNull().default("pending"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    applicationsExternalUnique: unique("applications_external_unique").on(
      table.externalSource,
      table.externalId
    ),
    applicationsStatusIdx: index("idx_applications_status").on(table.status),
    applicationsJobIdx: index("idx_applications_job_id").on(table.jobId),
    applicationsVeteranJobIdx: index("idx_applications_veteran_job").on(
      table.veteranProfileId,
      table.jobId
    )
  })
);

export const applicationEvents = pgTable(
  "application_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    eventType: applicationEventTypeEnum("event_type").notNull(),
    fromStatus: applicationStatusEnum("from_status"),
    toStatus: applicationStatusEnum("to_status"),
    reasonCode: text("reason_code"),
    note: text("note"),
    payload: jsonb("payload"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    applicationEventsApplicationIdx: index("idx_application_events_application_id").on(
      table.applicationId
    ),
    applicationEventsTypeIdx: index("idx_application_events_event_type").on(table.eventType),
    applicationEventsOccurredIdx: index("idx_application_events_occurred_at").on(table.occurredAt)
  })
);

export const matchRuns = pgTable(
  "match_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    algorithmVersion: text("algorithm_version").notNull().default("v1"),
    embeddingModelVersion: text("embedding_model_version").notNull().default("unknown"),
    rerankerVersion: text("reranker_version"),
    calibrationVersion: text("calibration_version"),
    scoreVersion: text("score_version").notNull().default("v1"),
    explanationVersion: text("explanation_version").notNull().default("v1"),
    status: matchRunStatusEnum("status").notNull().default("queued"),
    inputFingerprint: text("input_fingerprint"),
    sourceSnapshotHash: text("source_snapshot_hash"),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    matchRunsCreatedAtIdx: index("idx_match_runs_created_at").on(table.createdAt),
    matchRunsFingerprintIdx: index("idx_match_runs_input_fingerprint").on(table.inputFingerprint),
    matchRunsStatusIdx: index("idx_match_runs_status").on(table.status),
    matchRunsRequestedByIdx: index("idx_match_runs_requested_by_user_id").on(table.requestedByUserId),
    matchRunsJobIdx: index("idx_match_runs_job_id").on(table.jobId)
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
    matchRunId: uuid("match_run_id")
      .notNull()
      .references(() => matchRuns.id, { onDelete: "cascade" }),
    algorithmVersion: text("algorithm_version").notNull().default("v1"),
    embeddingModelVersion: text("embedding_model_version").notNull().default("unknown"),
    rerankerVersion: text("reranker_version"),
    calibrationVersion: text("calibration_version"),
    scoreVersion: text("score_version").notNull().default("v1"),
    explanationVersion: text("explanation_version").notNull().default("v1"),
    inputFingerprint: text("input_fingerprint"),
    sourceSnapshotHash: text("source_snapshot_hash"),
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
      table.matchRunId
    ),
    candidateScoreRunIdx: index("idx_candidate_job_scores_match_run_id").on(table.matchRunId),
    candidateScoreJobIdx: index("idx_candidate_job_scores_job_id_score_desc").on(
      table.jobId,
      table.score.desc()
    ),
    candidateScoreVeteranIdx: index("idx_candidate_job_scores_veteran_id_score_desc").on(
      table.veteranProfileId,
      table.score.desc()
    ),
    candidateScoreRankIdx: index("idx_candidate_job_scores_rank").on(table.rank),
    scoreBounds: check(
      "candidate_job_scores_score_bounds",
      sql`${table.score} >= 0 AND ${table.score} <= 1`
    ),
    semanticScoreBounds: check(
      "candidate_job_scores_semantic_score_bounds",
      sql`${table.semanticScore} IS NULL OR (${table.semanticScore} >= 0 AND ${table.semanticScore} <= 1)`
    ),
    ruleScoreBounds: check(
      "candidate_job_scores_rule_score_bounds",
      sql`${table.ruleScore} IS NULL OR (${table.ruleScore} >= 0 AND ${table.ruleScore} <= 1)`
    ),
    rankPositive: check(
      "candidate_job_scores_rank_positive",
      sql`${table.rank} IS NULL OR ${table.rank} > 0`
    )
  })
);

export const candidateJobScoreFeatures = pgTable(
  "candidate_job_score_features",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    candidateJobScoreId: uuid("candidate_job_score_id")
      .notNull()
      .references(() => candidateJobScores.id, { onDelete: "cascade" }),
    featureName: text("feature_name").notNull(),
    featureWeight: numeric("feature_weight", { precision: 8, scale: 6 }),
    featureValue: text("feature_value"),
    featureImpact: numeric("feature_impact", { precision: 8, scale: 6 }).notNull(),
    reasonCode: text("reason_code"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    candidateJobScoreFeaturesScoreIdx: index("idx_candidate_job_score_features_score_id").on(
      table.candidateJobScoreId
    ),
    candidateJobScoreFeaturesReasonIdx: index("idx_candidate_job_score_features_reason_code").on(
      table.reasonCode
    ),
    featureWeightBounds: check(
      "candidate_job_score_features_weight_bounds",
      sql`${table.featureWeight} IS NULL OR (${table.featureWeight} >= -1 AND ${table.featureWeight} <= 1)`
    ),
    featureImpactBounds: check(
      "candidate_job_score_features_impact_bounds",
      sql`${table.featureImpact} >= -1 AND ${table.featureImpact} <= 1`
    )
  })
);
