import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { roleHomePath, useAuth } from "../auth/AuthProvider";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      return;
    }

    setLoading(true);
    const result = await loginUser({ email, password });
    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? "Unable to login.");
      return;
    }

    const fromPath = (location.state as { from?: string } | null)?.from;
    navigate(fromPath ?? roleHomePath(result.user?.role ?? "veteran"), { replace: true });
  }

  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-300/80 bg-white/85 p-6 shadow-xl">
      <h1 className="text-2xl font-bold tracking-tight">Welcome Back</h1>
      <p className="mt-2 text-sm text-slate-600">
        Log in to continue to your Boots2Suits workspace.
      </p>
      <form className="mt-6 space-y-4" onSubmit={(event) => void onSubmit(event)}>
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
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-500 focus:ring"
          />
        </label>
        {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>
      <p className="mt-5 text-sm text-slate-600">
        New here?{" "}
        <Link to="/signup" className="font-semibold text-blue-700 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
