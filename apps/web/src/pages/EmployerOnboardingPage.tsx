import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveEmployerProfile } from "../lib/api";

type EmployerOnboardingState = {
  companyName: string;
  companySize: "startup" | "small" | "mid_market" | "enterprise";
  industry: string;
  websiteUrl: string;
  headquarters: string;
  hiringRoles: string;
  hiringVolume: string;
  veteranHiringPriority: boolean;
  clearanceSensitiveRoles: boolean;
  hiringRegions: string;
  recruiterName: string;
  recruiterTitle: string;
  recruiterTeam: string;
  preferredChannel: "email" | "phone" | "slack" | "teams";
  responseWindow: string;
};

const STORAGE_KEY = "boots2suits_employer_onboarding_draft";

const initialState: EmployerOnboardingState = {
  companyName: "",
  companySize: "small",
  industry: "",
  websiteUrl: "",
  headquarters: "",
  hiringRoles: "",
  hiringVolume: "1-10 hires/quarter",
  veteranHiringPriority: true,
  clearanceSensitiveRoles: false,
  hiringRegions: "",
  recruiterName: "",
  recruiterTitle: "",
  recruiterTeam: "",
  preferredChannel: "email",
  responseWindow: "Within 2 business days"
};

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function EmployerOnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<EmployerOnboardingState>(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<EmployerOnboardingState>;
      setState((prev) => ({ ...prev, ...parsed }));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const stepTitle = useMemo(() => {
    if (step === 1) return "Step 1: Company Basics";
    if (step === 2) return "Step 2: Hiring Context";
    return "Step 3: Recruiter Profile";
  }, [step]);

  function validateStep(currentStep: number) {
    if (currentStep === 1) {
      return Boolean(
        state.companyName.trim() &&
          state.companySize &&
          state.industry.trim() &&
          state.websiteUrl.trim() &&
          state.headquarters.trim()
      );
    }

    if (currentStep === 2) {
      return Boolean(
        splitCsv(state.hiringRoles).length > 0 &&
          state.hiringVolume.trim() &&
          splitCsv(state.hiringRegions).length > 0
      );
    }

    return Boolean(
      state.recruiterName.trim() &&
        state.recruiterTitle.trim() &&
        state.recruiterTeam.trim() &&
        state.preferredChannel
    );
  }

  function handleNext() {
    setError(null);
    if (!validateStep(step)) {
      setError("Please complete the required fields before continuing.");
      return;
    }
    setStep((prev) => Math.min(3, prev + 1));
  }

  function handleBack() {
    setError(null);
    setStep((prev) => Math.max(1, prev - 1));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!validateStep(3)) {
      setError("Please complete recruiter details before submitting.");
      return;
    }

    const payload = {
      companyName: state.companyName.trim(),
      companySize: state.companySize,
      industry: state.industry.trim(),
      websiteUrl: state.websiteUrl.trim(),
      headquarters: state.headquarters.trim(),
      hiringRoles: splitCsv(state.hiringRoles),
      hiringVolume: state.hiringVolume.trim(),
      veteranHiringPriority: state.veteranHiringPriority,
      clearanceSensitiveRoles: state.clearanceSensitiveRoles,
      hiringRegions: splitCsv(state.hiringRegions),
      recruiterName: state.recruiterName.trim(),
      recruiterTitle: state.recruiterTitle.trim(),
      recruiterTeam: state.recruiterTeam.trim(),
      contactPreferences: {
        preferredChannel: state.preferredChannel,
        responseWindow: state.responseWindow.trim()
      },
      complete: true
    };

    setLoading(true);
    const result = await saveEmployerProfile(payload);
    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? "Unable to save employer profile.");
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    navigate("/app/employer/profile", { replace: true });
  }

  return (
    <section className="mx-auto max-w-3xl rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Employer Onboarding</p>
      <h1 className="mt-2 text-2xl font-bold">{stepTitle}</h1>
      <p className="mt-2 text-sm text-slate-600">
        Step {step} of 3. Finish your employer profile to unlock job posting.
      </p>

      <form className="mt-6 space-y-5" onSubmit={(event) => void handleSubmit(event)}>
        {step === 1 ? (
          <>
            <input
              className="w-full rounded border p-2"
              placeholder="Company name"
              value={state.companyName}
              onChange={(event) => setState({ ...state, companyName: event.target.value })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                className="rounded border p-2"
                value={state.companySize}
                onChange={(event) =>
                  setState({
                    ...state,
                    companySize: event.target.value as EmployerOnboardingState["companySize"]
                  })
                }
              >
                <option value="startup">Startup</option>
                <option value="small">Small</option>
                <option value="mid_market">Mid Market</option>
                <option value="enterprise">Enterprise</option>
              </select>
              <input
                className="rounded border p-2"
                placeholder="Industry"
                value={state.industry}
                onChange={(event) => setState({ ...state, industry: event.target.value })}
              />
            </div>
            <input
              className="w-full rounded border p-2"
              placeholder="Company website (https://...)"
              value={state.websiteUrl}
              onChange={(event) => setState({ ...state, websiteUrl: event.target.value })}
            />
            <input
              className="w-full rounded border p-2"
              placeholder="Headquarters location"
              value={state.headquarters}
              onChange={(event) => setState({ ...state, headquarters: event.target.value })}
            />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <input
              className="w-full rounded border p-2"
              placeholder="Roles you hire for (comma separated)"
              value={state.hiringRoles}
              onChange={(event) => setState({ ...state, hiringRoles: event.target.value })}
            />
            <select
              className="w-full rounded border p-2"
              value={state.hiringVolume}
              onChange={(event) => setState({ ...state, hiringVolume: event.target.value })}
            >
              <option>1-10 hires/quarter</option>
              <option>11-25 hires/quarter</option>
              <option>26-50 hires/quarter</option>
              <option>50+ hires/quarter</option>
            </select>
            <input
              className="w-full rounded border p-2"
              placeholder="Hiring regions (comma separated)"
              value={state.hiringRegions}
              onChange={(event) => setState({ ...state, hiringRegions: event.target.value })}
            />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={state.veteranHiringPriority}
                onChange={(event) =>
                  setState({ ...state, veteranHiringPriority: event.target.checked })
                }
              />
              Veteran hiring is a priority
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={state.clearanceSensitiveRoles}
                onChange={(event) =>
                  setState({ ...state, clearanceSensitiveRoles: event.target.checked })
                }
              />
              We hire for clearance-sensitive roles
            </label>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <input
              className="w-full rounded border p-2"
              placeholder="Recruiter name"
              value={state.recruiterName}
              onChange={(event) => setState({ ...state, recruiterName: event.target.value })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className="rounded border p-2"
                placeholder="Recruiter title"
                value={state.recruiterTitle}
                onChange={(event) => setState({ ...state, recruiterTitle: event.target.value })}
              />
              <input
                className="rounded border p-2"
                placeholder="Team / function"
                value={state.recruiterTeam}
                onChange={(event) => setState({ ...state, recruiterTeam: event.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                className="rounded border p-2"
                value={state.preferredChannel}
                onChange={(event) =>
                  setState({
                    ...state,
                    preferredChannel: event.target.value as EmployerOnboardingState["preferredChannel"]
                  })
                }
              >
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="slack">Slack</option>
                <option value="teams">Microsoft Teams</option>
              </select>
              <input
                className="rounded border p-2"
                placeholder="Response window"
                value={state.responseWindow}
                onChange={(event) => setState({ ...state, responseWindow: event.target.value })}
              />
            </div>
          </>
        ) : null}

        {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 1 || loading}
            className="rounded border border-slate-400 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Back
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={loading}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading ? "Saving profile..." : "Complete onboarding"}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
