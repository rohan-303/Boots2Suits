import { useEffect, useMemo, useState } from "react";
import {
  getEmployerConnectors,
  saveEmployerConnectorConfig,
  testEmployerConnector
} from "../lib/api";
import type { EmployerConnectorConfig } from "../types/employer";

type EditableConnector = EmployerConnectorConfig & {
  simulationMode: "success" | "retryable_failure" | "non_retryable_failure";
};

function withDefaults(connector: EmployerConnectorConfig): EditableConnector {
  return {
    ...connector,
    simulationMode: "success"
  };
}

export function EmployerConnectorsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectors, setConnectors] = useState<EditableConnector[]>([]);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [testingType, setTestingType] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const result = await getEmployerConnectors();
    if (!result.ok || !result.data) {
      setError(result.error ?? "Unable to load connector settings.");
      setLoading(false);
      return;
    }
    setConnectors(result.data.connectors.map(withDefaults));
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const byType = useMemo(
    () => new Map(connectors.map((connector) => [connector.connectorType, connector])),
    [connectors]
  );

  function updateConnector(type: string, patch: Partial<EditableConnector>) {
    setConnectors((prev) =>
      prev.map((connector) =>
        connector.connectorType === type ? { ...connector, ...patch } : connector
      )
    );
  }

  async function save(type: EditableConnector["connectorType"]) {
    const connector = byType.get(type);
    if (!connector) return;
    setSavingType(type);
    const result = await saveEmployerConnectorConfig(type, {
      enabled: connector.enabled,
      environment: connector.environment,
      baseUrl: connector.baseUrl ?? "",
      authMode: connector.authMode,
      credentialConfigured: connector.credentialConfigured,
      credentialReference: connector.credentialReference ?? "",
      configMetadata: connector.configMetadata ?? {},
      fieldMappings: connector.fieldMappings ?? {}
    });
    setSavingType(null);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Failed to save connector.");
      return;
    }
    updateConnector(type, withDefaults(result.data.connector));
  }

  async function test(type: EditableConnector["connectorType"]) {
    const connector = byType.get(type);
    if (!connector) return;
    setTestingType(type);
    const result = await testEmployerConnector(type, connector.simulationMode);
    setTestingType(null);
    if (!result.ok || !result.data) {
      setError(result.error ?? "Connector test failed.");
      return;
    }
    await load();
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading connector settings...</div>;
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-300/70 bg-white/85 p-6 shadow-lg">
        <h1 className="text-2xl font-bold">ATS Connector Settings</h1>
        <p className="mt-2 text-sm text-slate-600">
          Configure connector readiness and run test validation before using connector exports.
        </p>
        {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
      </div>

      <div className="space-y-3">
        {connectors.map((connector) => (
          <div
            key={connector.connectorType}
            className="rounded-2xl border border-slate-300/70 bg-white/85 p-5 shadow-lg"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{connector.connectorType}</h2>
              <p className="text-xs text-slate-600">
                Last test: {connector.lastTestStatus} {connector.lastTestedAt ? `| ${new Date(connector.lastTestedAt).toLocaleString()}` : ""}
              </p>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-slate-700">
                <span className="font-semibold">Enabled</span>
                <input
                  type="checkbox"
                  checked={connector.enabled}
                  onChange={(event) =>
                    updateConnector(connector.connectorType, { enabled: event.target.checked })
                  }
                  className="ml-2"
                />
              </label>
              <label className="text-xs text-slate-700">
                <span className="font-semibold">Credential Configured</span>
                <input
                  type="checkbox"
                  checked={connector.credentialConfigured}
                  onChange={(event) =>
                    updateConnector(connector.connectorType, {
                      credentialConfigured: event.target.checked
                    })
                  }
                  className="ml-2"
                />
              </label>
              <label className="text-xs text-slate-700">
                <span className="font-semibold">Environment</span>
                <select
                  value={connector.environment}
                  onChange={(event) =>
                    updateConnector(connector.connectorType, {
                      environment: event.target.value as "sandbox" | "production"
                    })
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                >
                  <option value="sandbox">sandbox</option>
                  <option value="production">production</option>
                </select>
              </label>
              <label className="text-xs text-slate-700">
                <span className="font-semibold">Auth Mode</span>
                <select
                  value={connector.authMode}
                  onChange={(event) =>
                    updateConnector(connector.connectorType, {
                      authMode: event.target.value as "none" | "api_key_reference" | "oauth_placeholder"
                    })
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                >
                  <option value="none">none</option>
                  <option value="api_key_reference">api_key_reference</option>
                  <option value="oauth_placeholder">oauth_placeholder</option>
                </select>
              </label>
              <label className="text-xs text-slate-700">
                <span className="font-semibold">Base URL</span>
                <input
                  value={connector.baseUrl ?? ""}
                  onChange={(event) =>
                    updateConnector(connector.connectorType, { baseUrl: event.target.value })
                  }
                  placeholder="https://api.example-ats.com"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="text-xs text-slate-700">
                <span className="font-semibold">Credential Reference</span>
                <input
                  value={connector.credentialReference ?? ""}
                  onChange={(event) =>
                    updateConnector(connector.connectorType, { credentialReference: event.target.value })
                  }
                  placeholder="secret_ref:ats/greenhouse/company-1"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="text-xs text-slate-700">
                <span className="font-semibold">Test Simulation</span>
                <select
                  value={connector.simulationMode}
                  onChange={(event) =>
                    updateConnector(connector.connectorType, {
                      simulationMode: event.target.value as
                        | "success"
                        | "retryable_failure"
                        | "non_retryable_failure"
                    })
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                >
                  <option value="success">success</option>
                  <option value="retryable_failure">retryable_failure</option>
                  <option value="non_retryable_failure">non_retryable_failure</option>
                </select>
              </label>
            </div>
            {connector.lastTestMessage ? (
              <p className="mt-2 text-xs text-slate-600">{connector.lastTestMessage}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void save(connector.connectorType)}
                disabled={savingType === connector.connectorType}
                className="rounded bg-amber-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
              >
                {savingType === connector.connectorType ? "Saving..." : "Save Config"}
              </button>
              <button
                type="button"
                onClick={() => void test(connector.connectorType)}
                disabled={testingType === connector.connectorType}
                className="rounded border border-slate-400 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                {testingType === connector.connectorType ? "Testing..." : "Test Connector"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
