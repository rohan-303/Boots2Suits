import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveVeteranProfile, searchMilitaryOccupations } from "../lib/api";
import type { MilitaryOccupationSearchResult } from "../types/veteran";

type OnboardingState = {
  fullName: string;
  locationCity: string;
  locationState: string;
  workAuthorization: string;
  relocationPreference: string;
  militaryBranch: string;
  mosCode: string;
  mosTitle: string;
  highestRank: string;
  yearsOfService: string;
  serviceStartDate: string;
  serviceEndDate: string;
  clearanceLevel: string;
  responsibilitiesSummary: string;
  keySkills: string;
  toolsTechnologies: string;
  leadershipExperience: string;
  industriesOfInterest: string;
  desiredRoles: string;
  preferredIndustries: string;
  salaryExpectationMin: string;
  salaryExpectationMax: string;
  preferredWorkModes: string[];
};

const STORAGE_KEY = "boots2suits_veteran_onboarding_draft";

const initialState: OnboardingState = {
  fullName: "",
  locationCity: "",
  locationState: "",
  workAuthorization: "US Citizen",
  relocationPreference: "Open to relocation",
  militaryBranch: "army",
  mosCode: "",
  mosTitle: "",
  highestRank: "",
  yearsOfService: "",
  serviceStartDate: "",
  serviceEndDate: "",
  clearanceLevel: "none",
  responsibilitiesSummary: "",
  keySkills: "",
  toolsTechnologies: "",
  leadershipExperience: "",
  industriesOfInterest: "",
  desiredRoles: "",
  preferredIndustries: "",
  salaryExpectationMin: "",
  salaryExpectationMax: "",
  preferredWorkModes: ["hybrid"]
};

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function VeteranOnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<OnboardingState>(initialState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mosQuery, setMosQuery] = useState("");
  const [mosSearching, setMosSearching] = useState(false);
  const [mosResults, setMosResults] = useState<MilitaryOccupationSearchResult[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<OnboardingState>;
      setState((prev) => ({ ...prev, ...parsed }));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const stepTitle = useMemo(() => {
    if (step === 1) return "Step 1: Basic Info";
    if (step === 2) return "Step 2: Military Background";
    if (step === 3) return "Step 3: Skills & Experience";
    return "Step 4: Career Intent";
  }, [step]);

  function togglePreferredMode(mode: "remote" | "hybrid" | "onsite") {
    setState((prev) => {
      const exists = prev.preferredWorkModes.includes(mode);
      const next = exists
        ? prev.preferredWorkModes.filter((item) => item !== mode)
        : [...prev.preferredWorkModes, mode];
      return { ...prev, preferredWorkModes: next.length > 0 ? next : ["hybrid"] };
    });
  }

  async function handleMosSearch(query: string) {
    setMosQuery(query);
    if (query.trim().length < 2) {
      setMosResults([]);
      return;
    }
    setMosSearching(true);
    const result = await searchMilitaryOccupations(query, state.militaryBranch);
    setMosSearching(false);
    if (!result.ok || !result.data) {
      setMosResults([]);
      return;
    }
    setMosResults(result.data.occupations);
  }

  function applyMosSelection(occupation: MilitaryOccupationSearchResult) {
    setState((prev) => ({
      ...prev,
      mosCode: occupation.mosCode,
      mosTitle: occupation.mosTitle
    }));
    setMosQuery(`${occupation.mosCode} - ${occupation.mosTitle}`);
    setMosResults([]);
  }

  function validateStep(currentStep: number) {
    if (currentStep === 1) {
      return Boolean(
        state.fullName.trim() &&
          state.locationCity.trim() &&
          state.locationState.trim() &&
          state.workAuthorization.trim() &&
          state.relocationPreference.trim()
      );
    }
    if (currentStep === 2) {
      return Boolean(
        state.militaryBranch &&
          state.mosCode.trim() &&
          state.mosTitle.trim() &&
          state.highestRank.trim() &&
          state.clearanceLevel &&
          state.responsibilitiesSummary.trim()
      );
    }
    if (currentStep === 3) {
      return Boolean(
        splitCsv(state.keySkills).length > 0 &&
          state.leadershipExperience.trim() &&
          splitCsv(state.industriesOfInterest).length > 0
      );
    }
    return Boolean(
      splitCsv(state.desiredRoles).length > 0 &&
        state.preferredWorkModes.length > 0 &&
        (!state.salaryExpectationMin || !state.salaryExpectationMax ||
          Number(state.salaryExpectationMin) <= Number(state.salaryExpectationMax))
    );
  }

  function handleNext() {
    setError(null);
    if (!validateStep(step)) {
      setError("Please complete the required fields before continuing.");
      return;
    }
    setStep((prev) => Math.min(4, prev + 1));
  }

  function handleBack() {
    setError(null);
    setStep((prev) => Math.max(1, prev - 1));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!validateStep(4)) {
      setError("Please complete career intent details before submitting.");
      return;
    }

    setLoading(true);
    const payload = {
      fullName: state.fullName.trim(),
      locationCity: state.locationCity.trim(),
      locationState: state.locationState.trim(),
      workAuthorization: state.workAuthorization,
      relocationPreference: state.relocationPreference,
      militaryBranch: state.militaryBranch,
      mosCode: state.mosCode.trim(),
      mosTitle: state.mosTitle.trim(),
      highestRank: state.highestRank.trim(),
      yearsOfService: state.yearsOfService ? Number(state.yearsOfService) : null,
      serviceStartDate: state.serviceStartDate || null,
      serviceEndDate: state.serviceEndDate || null,
      clearanceLevel: state.clearanceLevel,
      responsibilitiesSummary: state.responsibilitiesSummary.trim(),
      keySkills: splitCsv(state.keySkills),
      toolsTechnologies: splitCsv(state.toolsTechnologies),
      leadershipExperience: state.leadershipExperience.trim(),
      industriesOfInterest: splitCsv(state.industriesOfInterest),
      desiredRoles: splitCsv(state.desiredRoles),
      preferredIndustries: splitCsv(state.preferredIndustries),
      salaryExpectationMin: state.salaryExpectationMin ? Number(state.salaryExpectationMin) : null,
      salaryExpectationMax: state.salaryExpectationMax ? Number(state.salaryExpectationMax) : null,
      preferredWorkModes: state.preferredWorkModes,
      complete: true
    };

    const result = await saveVeteranProfile(payload);
    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? "Unable to save profile.");
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    navigate("/app/veteran/profile", { replace: true });
  }

  return (
    <section className="mx-auto max-w-3xl rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Veteran Onboarding</p>
      <h1 className="mt-2 text-2xl font-bold">{stepTitle}</h1>
      <p className="mt-2 text-sm text-slate-600">Step {step} of 4. Complete your profile to unlock your dashboard.</p>

      <form className="mt-6 space-y-5" onSubmit={(event) => void handleSubmit(event)}>
        {step === 1 ? (
          <>
            <input className="w-full rounded border p-2" placeholder="Full name" value={state.fullName} onChange={(e) => setState({ ...state, fullName: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded border p-2" placeholder="City" value={state.locationCity} onChange={(e) => setState({ ...state, locationCity: e.target.value })} />
              <input className="rounded border p-2" placeholder="State" value={state.locationState} onChange={(e) => setState({ ...state, locationState: e.target.value })} />
            </div>
            <input className="w-full rounded border p-2" placeholder="Work authorization (e.g., US Citizen)" value={state.workAuthorization} onChange={(e) => setState({ ...state, workAuthorization: e.target.value })} />
            <input className="w-full rounded border p-2" placeholder="Relocation preference" value={state.relocationPreference} onChange={(e) => setState({ ...state, relocationPreference: e.target.value })} />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <select className="w-full rounded border p-2" value={state.militaryBranch} onChange={(e) => setState({ ...state, militaryBranch: e.target.value })}>
              <option value="army">Army</option>
              <option value="navy">Navy</option>
              <option value="air_force">Air Force</option>
              <option value="marines">Marines</option>
              <option value="space_force">Space Force</option>
              <option value="coast_guard">Coast Guard</option>
              <option value="national_guard">National Guard</option>
              <option value="other">Other</option>
            </select>
            <div className="rounded border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                MOS Lookup (Recommended)
              </p>
              <input
                className="mt-2 w-full rounded border p-2"
                placeholder="Search MOS code or title"
                value={mosQuery}
                onChange={(e) => void handleMosSearch(e.target.value)}
              />
              {mosSearching ? <p className="mt-2 text-xs text-slate-500">Searching occupations...</p> : null}
              {mosResults.length > 0 ? (
                <div className="mt-2 max-h-44 overflow-auto rounded border border-slate-200 bg-white">
                  {mosResults.map((occupation) => (
                    <button
                      key={occupation.id}
                      type="button"
                      onClick={() => applyMosSelection(occupation)}
                      className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <p className="font-medium">
                        {occupation.mosCode} - {occupation.mosTitle}
                      </p>
                      <p className="text-xs text-slate-600">
                        {occupation.civilianEquivalentTitle ?? "Civilian equivalent pending"}
                      </p>
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="mt-2 text-xs text-slate-500">
                You can still manually edit MOS code/title below.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded border p-2" placeholder="MOS Code" value={state.mosCode} onChange={(e) => setState({ ...state, mosCode: e.target.value })} />
              <input className="rounded border p-2" placeholder="MOS Title" value={state.mosTitle} onChange={(e) => setState({ ...state, mosTitle: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded border p-2" placeholder="Highest Rank" value={state.highestRank} onChange={(e) => setState({ ...state, highestRank: e.target.value })} />
              <input className="rounded border p-2" placeholder="Years of service" value={state.yearsOfService} onChange={(e) => setState({ ...state, yearsOfService: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded border p-2" type="date" value={state.serviceStartDate} onChange={(e) => setState({ ...state, serviceStartDate: e.target.value })} />
              <input className="rounded border p-2" type="date" value={state.serviceEndDate} onChange={(e) => setState({ ...state, serviceEndDate: e.target.value })} />
            </div>
            <select className="w-full rounded border p-2" value={state.clearanceLevel} onChange={(e) => setState({ ...state, clearanceLevel: e.target.value })}>
              <option value="none">No Clearance</option>
              <option value="confidential">Confidential</option>
              <option value="secret">Secret</option>
              <option value="top_secret">Top Secret</option>
              <option value="ts_sci">TS/SCI</option>
              <option value="other">Other</option>
            </select>
            <textarea className="w-full rounded border p-2" rows={4} placeholder="Briefly describe your responsibilities." value={state.responsibilitiesSummary} onChange={(e) => setState({ ...state, responsibilitiesSummary: e.target.value })} />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <input className="w-full rounded border p-2" placeholder="Key skills (comma separated)" value={state.keySkills} onChange={(e) => setState({ ...state, keySkills: e.target.value })} />
            <input className="w-full rounded border p-2" placeholder="Tools/technologies (comma separated)" value={state.toolsTechnologies} onChange={(e) => setState({ ...state, toolsTechnologies: e.target.value })} />
            <textarea className="w-full rounded border p-2" rows={3} placeholder="Leadership experience" value={state.leadershipExperience} onChange={(e) => setState({ ...state, leadershipExperience: e.target.value })} />
            <input className="w-full rounded border p-2" placeholder="Industries of interest (comma separated)" value={state.industriesOfInterest} onChange={(e) => setState({ ...state, industriesOfInterest: e.target.value })} />
          </>
        ) : null}

        {step === 4 ? (
          <>
            <input className="w-full rounded border p-2" placeholder="Desired roles/job titles (comma separated)" value={state.desiredRoles} onChange={(e) => setState({ ...state, desiredRoles: e.target.value })} />
            <input className="w-full rounded border p-2" placeholder="Preferred industries (comma separated)" value={state.preferredIndustries} onChange={(e) => setState({ ...state, preferredIndustries: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="rounded border p-2" placeholder="Salary min" value={state.salaryExpectationMin} onChange={(e) => setState({ ...state, salaryExpectationMin: e.target.value })} />
              <input className="rounded border p-2" placeholder="Salary max" value={state.salaryExpectationMax} onChange={(e) => setState({ ...state, salaryExpectationMax: e.target.value })} />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["remote", "hybrid", "onsite"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => togglePreferredMode(mode)}
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    state.preferredWorkModes.includes(mode)
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {mode}
                </button>
              ))}
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
          {step < 4 ? (
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
              className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
            >
              {loading ? "Saving profile..." : "Complete onboarding"}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
