import { relations } from "drizzle-orm";
import {
  applications,
  candidateJobScores,
  companies,
  jobPersonas,
  jobs,
  users,
  veteranPersonas,
  veteranProfiles
} from "./schema.js";

export const usersRelations = relations(users, ({ many }) => ({
  veteranProfiles: many(veteranProfiles),
  companies: many(companies),
  postedJobs: many(jobs)
}));

export const companiesRelations = relations(companies, ({ one, many }) => ({
  owner: one(users, {
    fields: [companies.ownerUserId],
    references: [users.id]
  }),
  jobs: many(jobs)
}));

export const veteranProfilesRelations = relations(veteranProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [veteranProfiles.userId],
    references: [users.id]
  }),
  personas: many(veteranPersonas),
  applications: many(applications),
  candidateScores: many(candidateJobScores)
}));

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

export const applicationsRelations = relations(applications, ({ one }) => ({
  profile: one(veteranProfiles, {
    fields: [applications.veteranProfileId],
    references: [veteranProfiles.id]
  }),
  job: one(jobs, {
    fields: [applications.jobId],
    references: [jobs.id]
  })
}));

export const candidateJobScoresRelations = relations(candidateJobScores, ({ one }) => ({
  profile: one(veteranProfiles, {
    fields: [candidateJobScores.veteranProfileId],
    references: [veteranProfiles.id]
  }),
  job: one(jobs, {
    fields: [candidateJobScores.jobId],
    references: [jobs.id]
  })
}));

