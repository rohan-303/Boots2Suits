import { relations } from "drizzle-orm";
import {
  applicationEvents,
  applications,
  candidateJobScoreFeatures,
  candidateJobScores,
  companies,
  jobPersonas,
  jobs,
  matchRuns,
  militaryOccupations,
  users,
  veteranOccupationHistory,
  veteranPersonas,
  veteranProfiles
} from "./schema.js";

export const usersRelations = relations(users, ({ many }) => ({
  veteranProfiles: many(veteranProfiles),
  companies: many(companies),
  postedJobs: many(jobs),
  applicationEvents: many(applicationEvents)
}));

export const companiesRelations = relations(companies, ({ one, many }) => ({
  owner: one(users, {
    fields: [companies.ownerUserId],
    references: [users.id]
  }),
  jobs: many(jobs)
}));

export const militaryOccupationsRelations = relations(militaryOccupations, ({ many }) => ({
  veteranHistory: many(veteranOccupationHistory)
}));

export const veteranProfilesRelations = relations(veteranProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [veteranProfiles.userId],
    references: [users.id]
  }),
  personas: many(veteranPersonas),
  occupationHistory: many(veteranOccupationHistory),
  applications: many(applications),
  candidateScores: many(candidateJobScores)
}));

export const veteranOccupationHistoryRelations = relations(
  veteranOccupationHistory,
  ({ one }) => ({
    profile: one(veteranProfiles, {
      fields: [veteranOccupationHistory.veteranProfileId],
      references: [veteranProfiles.id]
    }),
    militaryOccupation: one(militaryOccupations, {
      fields: [veteranOccupationHistory.militaryOccupationId],
      references: [militaryOccupations.id]
    })
  })
);

export const veteranPersonasRelations = relations(veteranPersonas, ({ one }) => ({
  profile: one(veteranProfiles, {
    fields: [veteranPersonas.veteranProfileId],
    references: [veteranProfiles.id]
  })
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  company: one(companies, {
    fields: [jobs.companyId],
    references: [companies.id]
  }),
  postedBy: one(users, {
    fields: [jobs.postedByUserId],
    references: [users.id]
  }),
  personas: many(jobPersonas),
  applications: many(applications),
  candidateScores: many(candidateJobScores)
}));

export const jobPersonasRelations = relations(jobPersonas, ({ one }) => ({
  job: one(jobs, {
    fields: [jobPersonas.jobId],
    references: [jobs.id]
  })
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  profile: one(veteranProfiles, {
    fields: [applications.veteranProfileId],
    references: [veteranProfiles.id]
  }),
  job: one(jobs, {
    fields: [applications.jobId],
    references: [jobs.id]
  }),
  events: many(applicationEvents)
}));

export const applicationEventsRelations = relations(applicationEvents, ({ one }) => ({
  application: one(applications, {
    fields: [applicationEvents.applicationId],
    references: [applications.id]
  }),
  createdByUser: one(users, {
    fields: [applicationEvents.createdByUserId],
    references: [users.id]
  })
}));

export const matchRunsRelations = relations(matchRuns, ({ many }) => ({
  candidateScores: many(candidateJobScores)
}));

export const candidateJobScoresRelations = relations(candidateJobScores, ({ one, many }) => ({
  profile: one(veteranProfiles, {
    fields: [candidateJobScores.veteranProfileId],
    references: [veteranProfiles.id]
  }),
  job: one(jobs, {
    fields: [candidateJobScores.jobId],
    references: [jobs.id]
  }),
  matchRun: one(matchRuns, {
    fields: [candidateJobScores.matchRunId],
    references: [matchRuns.id]
  }),
  features: many(candidateJobScoreFeatures)
}));

export const candidateJobScoreFeaturesRelations = relations(
  candidateJobScoreFeatures,
  ({ one }) => ({
    candidateScore: one(candidateJobScores, {
      fields: [candidateJobScoreFeatures.candidateJobScoreId],
      references: [candidateJobScores.id]
    })
  })
);

