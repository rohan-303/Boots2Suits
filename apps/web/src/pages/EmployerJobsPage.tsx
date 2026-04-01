import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createEmployerJob, getEmployerJobs } from "../lib/api";
import type { EmployerJob } from "../types/employer";

type JobFormState = {
  title: string;
  department: string;
  locationCity: string;
  locationState: string;
  locationType: "onsite" | "hybrid" | "remote";
  employmentType: "full_time" | "part_time" | "contract" | "internship";
  status: "draft" | "published";
  compensationMin: string;
  compensationMax: string;
  description: string;
  requirements: string;
  mustHaveSkills: string;
  niceToHaveSkills: string;
  requiredExperienceLevel: string;
  clearanceRequirement: string;
  travelRequirement: string;
};

const initialFormState: JobFormState = {
  title: "",
  department: "",
  locationCity: "",
  locationState: "",
  locationType: "hybrid",
  employmentType: "full_time",
  status: "draft",
  compensationMin: "",
  compensationMax: "",
  description: "",
  requirements: "",
  mustHaveSkills: "",
  niceToHaveSkills: "",
  requiredExperienceLevel: "",
  clearanceRequirement: "",
  travelRequirement: ""
};

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function EmployerJobsPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<EmployerJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<JobFormState>(initialFormState);

  async function loadJobs() {
    setLoading(true);
    const result = await getEmployerJobs();
    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to load jobs.");
      setLoading(false);
      return;
    }
    setJobs(result.data.jobs);
    setLoading(false);
  }

  useEffect(() => {
    void loadJobs();
  }, []);

  async function onCreateJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.title.trim() || !form.description.trim() || splitCsv(form.mustHaveSkills).length === 0) {
      setError("Title, description, and must-have skills are required.");
      return;
    }

    if (
      form.compensationMin &&
      form.compensationMax &&
      Number(form.compensationMin) > Number(form.compensationMax)
    ) {
      setError("Compensation min cannot be greater than compensation max.");
      return;
    }

    setSaving(true);
    const result = await createEmployerJob({
      title: form.title.trim(),
      department: form.department.trim() || null,
      locationCity: form.locationCity.trim() || null,
      locationState: form.locationState.trim() || null,
      locationType: form.locationType,
      employmentType: form.employmentType,
      status: form.status,
      compensationMin: form.compensationMin ? Number(form.compensationMin) : null,
      compensationMax: form.compensationMax ? Number(form.compensationMax) : null,
      currency: "USD",
      description: form.description.trim(),
      requirements: form.requirements.trim() || null,
      mustHaveSkills: splitCsv(form.mustHaveSkills),
      niceToHaveSkills: splitCsv(form.niceToHaveSkills),
      requiredExperienceLevel: form.requiredExperienceLevel.trim() || null,
      clearanceRequirement: form.clearanceRequirement.trim() || null,
      travelRequirement: form.travelRequirement.trim() || null
    });
    setSaving(false);

    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to create job.");
      return;
    }

    setForm(initialFormState);
    await loadJobs();
    navigate(`/app/employer/jobs/${result.data.jobId}`, { replace: true });
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
        <h1 className="text-2xl font-bold">Employer Jobs</h1>
        <p className="mt-2 text-sm text-slate-600">
          Create structured job postings and generate deterministic job personas.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
        <h2 className="text-xl font-semibold">Create Job Posting</h2>
        <form className="mt-4 space-y-3" onSubmit={(event) => void onCreateJob(event)}>
          <input
            className="w-full rounded border p-2"
            placeholder="Job title"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="rounded border p-2"
              placeholder="Department"
              value={form.department}
              onChange={(event) => setForm({ ...form, department: event.target.value })}
            />
            <select
              className="rounded border p-2"
              value={form.locationType}
              onChange={(event) =>
                setForm({
                  ...form,
                  locationType: event.target.value as JobFormState["locationType"]
                })
              }
            >
              <option value="onsite">Onsite</option>
              <option value="hybrid">Hybrid</option>
              <option value="remote">Remote</option>
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="rounded border p-2"
              placeholder="Location city"
              value={form.locationCity}
              onChange={(event) => setForm({ ...form, locationCity: event.target.value })}
            />
            <input
              className="rounded border p-2"
              placeholder="Location state"
              value={form.locationState}
              onChange={(event) => setForm({ ...form, locationState: event.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <select
              className="rounded border p-2"
              value={form.employmentType}
              onChange={(event) =>
                setForm({
                  ...form,
                  employmentType: event.target.value as JobFormState["employmentType"]
                })
              }
            >
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="contract">Contract</option>
              <option value="internship">Internship</option>
            </select>
            <input
              className="rounded border p-2"
              placeholder="Compensation min"
              value={form.compensationMin}
              onChange={(event) => setForm({ ...form, compensationMin: event.target.value })}
            />
            <input
              className="rounded border p-2"
              placeholder="Compensation max"
              value={form.compensationMax}
              onChange={(event) => setForm({ ...form, compensationMax: event.target.value })}
            />
          </div>
          <textarea
            className="w-full rounded border p-2"
            rows={4}
            placeholder="Job description"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
          <textarea
            className="w-full rounded border p-2"
            rows={2}
            placeholder="Requirements (optional)"
            value={form.requirements}
            onChange={(event) => setForm({ ...form, requirements: event.target.value })}
          />
          <input
            className="w-full rounded border p-2"
            placeholder="Must-have skills (comma separated)"
            value={form.mustHaveSkills}
            onChange={(event) => setForm({ ...form, mustHaveSkills: event.target.value })}
          />
          <input
            className="w-full rounded border p-2"
            placeholder="Nice-to-have skills (comma separated)"
            value={form.niceToHaveSkills}
            onChange={(event) => setForm({ ...form, niceToHaveSkills: event.target.value })}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              className="rounded border p-2"
              placeholder="Experience level"
              value={form.requiredExperienceLevel}
              onChange={(event) =>
                setForm({ ...form, requiredExperienceLevel: event.target.value })
              }
            />
            <input
              className="rounded border p-2"
              placeholder="Clearance requirement"
              value={form.clearanceRequirement}
              onChange={(event) => setForm({ ...form, clearanceRequirement: event.target.value })}
            />
            <input
              className="rounded border p-2"
              placeholder="Travel requirement"
              value={form.travelRequirement}
              onChange={(event) => setForm({ ...form, travelRequirement: event.target.value })}
            />
          </div>
          <select
            className="w-full rounded border p-2"
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value as "draft" | "published" })}
          >
            <option value="draft">Save as draft</option>
            <option value="published">Publish now</option>
          </select>
          {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Creating job..." : "Create job"}
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
        <h2 className="text-xl font-semibold">Current Jobs</h2>
        {loading ? (
          <p className="mt-2 text-sm text-slate-600">Loading jobs...</p>
        ) : jobs.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            No jobs yet. Create your first posting to generate a job persona.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {jobs.map((job) => (
              <li key={job.id} className="rounded border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-800">{job.title}</p>
                    <p className="text-slate-600">
                      {job.department ?? "General"} - {job.locationType} - {job.status}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Link className="font-semibold text-amber-700 underline" to={`/app/employer/jobs/${job.id}`}>
                      View job
                    </Link>
                    <Link
                      className="font-semibold text-amber-700 underline"
                      to={`/app/employer/jobs/${job.id}/persona`}
                    >
                      View persona
                    </Link>
                    <Link
                      className="font-semibold text-amber-700 underline"
                      to={`/app/employer/jobs/${job.id}/matches`}
                    >
                      View matches
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
