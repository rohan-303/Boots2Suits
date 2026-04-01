import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { roleHomePath, useAuth } from "../auth/AuthProvider";
import type { UserRole } from "../auth/types";

type SignupRole = Exclude<UserRole, "admin">;

export function SignupPage() {
  const navigate = useNavigate();
  const { signupUser } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<SignupRole>("veteran");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    const result = await signupUser({ fullName, email, password, role });
    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? "Unable to create account.");
      return;
    }

    const targetRole = result.user?.role ?? role;
    navigate(
      targetRole === "veteran"
        ? "/app/veteran/onboarding"
        : targetRole === "employer"
        ? "/app/employer/onboarding"
        : roleHomePath(targetRole),
      {
        replace: true
      }
    );
  }

  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-300/80 bg-white/85 p-6 shadow-xl">
      <h1 className="text-2xl font-bold tracking-tight">Create Account</h1>
      <p className="mt-2 text-sm text-slate-600">
        Sign up as a veteran or employer. Admin accounts are internal-only.
      </p>
      <form className="mt-6 space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <label className="block text-sm font-medium text-slate-700">
          Full Name
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            type="text"
            autoComplete="name"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Role
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as SignupRole)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
          >
            <option value="veteran">Veteran</option>
            <option value="employer">Employer</option>
          </select>
        </label>
        {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>
      <p className="mt-5 text-sm text-slate-600">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-blue-700 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
