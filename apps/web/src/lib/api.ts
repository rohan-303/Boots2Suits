import type { AuthUser, UserRole } from "../auth/types";
import type {
  EmployerJob,
  EmployerJobDetail,
  EmployerProfile,
  JobPersona
} from "../types/employer";
import type { VeteranApplication } from "../types/application";
import type { EmployerMatchResult, VeteranRecommendation } from "../types/matching";
import type {
  MilitaryOccupationSearchResult,
  VeteranPersona,
  VeteranProfile,
  VeteranResume
} from "../types/veteran";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

type ApiResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      }
    });

    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      user?: AuthUser;
    };

    if (!response.ok) {
      return {
        ok: false,
        error: body.error ?? `Request failed with status ${response.status}`
      };
    }

    return { ok: true, data: body as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network error"
    };
  }
}

async function requestForm<T>(path: string, formData: FormData, method = "POST"): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: "include",
      body: formData
    });

    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };

    if (!response.ok) {
      return {
        ok: false,
        error: body.error ?? `Request failed with status ${response.status}`
      };
    }

    return { ok: true, data: body as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network error"
    };
  }
}

export async function getCurrentUser() {
  return request<{ ok: true; user: AuthUser }>("/auth/me", { method: "GET" });
}

export async function login(payload: { email: string; password: string }) {
  return request<{ ok: true; user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function signup(payload: {
  email: string;
  password: string;
  fullName: string;
  role: Exclude<UserRole, "admin">;
}) {
  return request<{ ok: true; user: AuthUser }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function logout() {
  return request<{ ok: true }>("/auth/logout", { method: "POST" });
}

export async function getVeteranProfile() {
  return request<{
    ok: true;
    profile: VeteranProfile | null;
    complete: boolean;
    persona: VeteranPersona | null;
    resume: VeteranResume | null;
  }>("/veteran/profile", { method: "GET" });
}

export async function saveVeteranProfile(payload: Record<string, unknown>) {
  return request<{ ok: true }>("/veteran/profile", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function generateVeteranPersona() {
  return request<{
    ok: true;
    persona: VeteranPersona;
  }>("/veteran/persona/generate", { method: "POST" });
}

export async function uploadVeteranResume(file: File) {
  const formData = new FormData();
  formData.append("resume", file);
  return requestForm<{
    ok: true;
    resume: {
      id: string;
      parseStatus: "uploaded" | "parsed" | "failed";
      confidence: number;
      sectionsFound: {
        summary: boolean;
        experience: number;
        education: number;
        certifications: number;
        skills: number;
      };
    };
  }>("/veteran/resume/upload", formData, "POST");
}

export async function searchMilitaryOccupations(query: string, branch?: string) {
  const params = new URLSearchParams();
  params.set("q", query);
  if (branch) params.set("branch", branch);
  return request<{
    ok: true;
    occupations: MilitaryOccupationSearchResult[];
  }>(`/military/occupations/search?${params.toString()}`, { method: "GET" });
}

export async function getEmployerProfile() {
  return request<{
    ok: true;
    profile: EmployerProfile | null;
    complete: boolean;
  }>("/employer/profile", { method: "GET" });
}

export async function saveEmployerProfile(payload: Record<string, unknown>) {
  return request<{ ok: true }>("/employer/profile", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getEmployerJobs() {
  return request<{
    ok: true;
    jobs: EmployerJob[];
  }>("/employer/jobs", { method: "GET" });
}

export async function createEmployerJob(payload: Record<string, unknown>) {
  return request<{
    ok: true;
    jobId: string;
  }>("/employer/jobs", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getEmployerJob(jobId: string) {
  return request<{
    ok: true;
    job: EmployerJobDetail;
    persona: JobPersona | null;
  }>(`/employer/jobs/${jobId}`, { method: "GET" });
}

export async function generateEmployerJobPersona(jobId: string) {
  return request<{
    ok: true;
    persona: JobPersona;
  }>(`/employer/jobs/${jobId}/persona/generate`, { method: "POST" });
}

export async function runJobMatching(jobId: string) {
  return request<{
    ok: true;
    matchRunId: string;
    totalCandidatesScored: number;
  }>(`/matching/jobs/${jobId}/run`, { method: "POST" });
}

export async function getJobMatchResults(jobId: string) {
  return request<{
    ok: true;
    job: { id: string; title: string };
    matchRun: {
      id: string;
      algorithmVersion: string;
      scoreVersion: string;
      explanationVersion: string;
      createdAt: string;
    } | null;
    results: EmployerMatchResult[];
  }>(`/matching/jobs/${jobId}/results`, { method: "GET" });
}

export async function getVeteranJobRecommendations(veteranProfileId: string) {
  return request<{
    ok: true;
    veteranProfileId: string;
    matchRun: {
      id: string;
      algorithmVersion: string;
      scoreVersion: string;
      explanationVersion: string;
      createdAt: string;
    } | null;
    results: VeteranRecommendation[];
  }>(`/matching/veterans/${veteranProfileId}/jobs`, { method: "GET" });
}

export async function createApplication(payload: { jobId: string }) {
  return request<{
    ok: true;
    application: {
      id: string;
      status: string;
      appliedAt: string;
    };
  }>("/applications", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getMyApplications() {
  return request<{
    ok: true;
    applications: VeteranApplication[];
  }>("/applications/me", { method: "GET" });
}

export async function employerShortlistCandidate(jobId: string, veteranProfileId: string) {
  return request<{
    ok: true;
    application: { id: string; status: string };
    created?: boolean;
  }>(`/employer/jobs/${jobId}/candidates/${veteranProfileId}/shortlist`, { method: "POST" });
}

export async function employerReviewCandidate(jobId: string, veteranProfileId: string) {
  return request<{
    ok: true;
    application: { id: string; status: string };
    created?: boolean;
  }>(`/employer/jobs/${jobId}/candidates/${veteranProfileId}/review`, { method: "POST" });
}

export async function employerRejectCandidate(jobId: string, veteranProfileId: string) {
  return request<{
    ok: true;
    application: { id: string; status: string };
    created?: boolean;
  }>(`/employer/jobs/${jobId}/candidates/${veteranProfileId}/reject`, { method: "POST" });
}

export async function employerResetCandidateAction(jobId: string, veteranProfileId: string) {
  return request<{
    ok: true;
    application: { id: string; status: string };
  }>(`/employer/jobs/${jobId}/candidates/${veteranProfileId}/reset`, { method: "POST" });
}
