import { SERVICE_NAMES } from "@boots2suits/shared";

export function App() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="mx-auto max-w-3xl p-10">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          Phase 0 Foundation
        </p>
        <h1 className="mt-3 text-3xl font-bold">Boots2Suits</h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          Frontend workspace is ready. Connect this app to the API and worker in
          subsequent phases.
        </p>
        <ul className="mt-6 list-disc pl-6 text-sm text-slate-700">
          <li>Web service: {SERVICE_NAMES.web}</li>
          <li>API service: {SERVICE_NAMES.api}</li>
          <li>Worker service: {SERVICE_NAMES.worker}</li>
        </ul>
      </section>
    </main>
  );
}

