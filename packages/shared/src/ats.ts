import { createHash } from "node:crypto";
import { normalizeError, type ErrorType } from "./observability.js";

export type AtsConnectorType =
  | "manual_handoff"
  | "greenhouse_stub"
  | "greenhouse"
  | "lever"
  | "workday";

export type AtsConnectorEnvironment = "sandbox" | "production";
export type AtsConnectorAuthMode = "none" | "api_key_reference" | "oauth_placeholder";
export type AtsConnectorTestStatus = "not_tested" | "passed" | "failed";
export type ConnectorSimulationMode = "success" | "retryable_failure" | "non_retryable_failure";

export type ConnectorConfigRecord = {
  connectorType: AtsConnectorType;
  enabled: boolean;
  environment: AtsConnectorEnvironment;
  baseUrl: string | null;
  authMode: AtsConnectorAuthMode;
  credentialConfigured: boolean;
  credentialReference: string | null;
  configMetadata: Record<string, unknown> | null;
  fieldMappings: Record<string, unknown> | null;
};

export type AtsConnectorContext = {
  exportId: string;
  jobId: string;
  exportFormat: "json" | "csv";
  requestFingerprint: string;
  requestedByUserId: string;
};

export type AtsConnectorExportPackage = {
  meta: {
    exportId: string;
    exportTarget: AtsConnectorType;
    exportFormat: "json" | "csv";
    externalSource: string | null;
    candidateCount: number;
    generatedAt: string;
  };
  job: {
    id: string;
    title: string;
    department: string | null;
  };
  recruiterHandoffPackets: Array<Record<string, unknown>>;
  csvContent: string | null;
};

export type AtsConnectorSendInput = {
  context: AtsConnectorContext;
  exportPackage: AtsConnectorExportPackage;
  simulationMode: ConnectorSimulationMode;
  connectorConfig: ConnectorConfigRecord | null;
};

export type AtsConnectorSendResult = {
  status: "exported";
  externalSource: string;
  externalId: string | null;
  responseSummary: Record<string, unknown>;
  requestPayload: Record<string, unknown>;
};

export class AtsConnectorError extends Error {
  readonly retryable: boolean;
  readonly errorType: ErrorType;
  readonly details: Record<string, unknown> | null;

  constructor(input: {
    message: string;
    retryable: boolean;
    errorType: ErrorType;
    details?: Record<string, unknown> | null;
  }) {
    super(input.message);
    this.name = "AtsConnectorError";
    this.retryable = input.retryable;
    this.errorType = input.errorType;
    this.details = input.details ?? null;
  }
}

export type NormalizedConnectorError = {
  errorType: ErrorType;
  errorMessage: string;
  errorStack: string | null;
  retryable: boolean;
  details: Record<string, unknown> | null;
};

export interface AtsConnectorAdapter {
  readonly target: AtsConnectorType;
  validateConfiguration(input: {
    connectorConfig: ConnectorConfigRecord | null;
  }): { ok: boolean; errors: string[] };
  prepareRequest(input: AtsConnectorSendInput): Record<string, unknown>;
  sendExport(input: AtsConnectorSendInput): Promise<AtsConnectorSendResult>;
  normalizeError(error: unknown): NormalizedConnectorError;
}

function deterministicExternalId(prefix: string, seed: string) {
  const digest = createHash("sha256").update(seed).digest("hex").slice(0, 16);
  return `${prefix}_${digest}`;
}

function normalizeConnectorError(error: unknown): NormalizedConnectorError {
  if (error instanceof AtsConnectorError) {
    return {
      errorType: error.errorType,
      errorMessage: error.message,
      errorStack: error.stack ?? null,
      retryable: error.retryable,
      details: error.details
    };
  }
  const normalized = normalizeError(error);
  return {
    errorType: normalized.errorType,
    errorMessage: normalized.errorMessage,
    errorStack: normalized.errorStack,
    retryable: normalized.errorType !== "VALIDATION_ERROR",
    details: null
  };
}

function validateConfiguredConnectorConfig(input: { connectorConfig: ConnectorConfigRecord | null }) {
  const errors: string[] = [];
  if (!input.connectorConfig) {
    return { ok: false, errors: ["Connector configuration is missing."] };
  }
  if (!input.connectorConfig.enabled) {
    errors.push("Connector is disabled.");
  }
  if (!input.connectorConfig.credentialConfigured) {
    errors.push("Connector credential is not configured.");
  }
  if (!input.connectorConfig.baseUrl) {
    errors.push("Connector base URL is required.");
  }
  return {
    ok: errors.length === 0,
    errors
  };
}

const manualHandoffAdapter: AtsConnectorAdapter = {
  target: "manual_handoff",
  validateConfiguration() {
    return { ok: true, errors: [] };
  },
  prepareRequest(input: AtsConnectorSendInput) {
    return {
      connector: "manual_handoff",
      exportId: input.context.exportId,
      format: input.context.exportFormat,
      candidateCount: input.exportPackage.meta.candidateCount,
      generatedAt: input.exportPackage.meta.generatedAt
    };
  },
  async sendExport(input: AtsConnectorSendInput): Promise<AtsConnectorSendResult> {
    return {
      status: "exported",
      externalSource: "manual_handoff",
      externalId: null,
      requestPayload: this.prepareRequest(input),
      responseSummary: {
        connector: "manual_handoff",
        handoffMode: "internal_packet_export",
        packetCount: input.exportPackage.meta.candidateCount,
        includesCsv: Boolean(input.exportPackage.csvContent),
        jobTitle: input.exportPackage.job.title
      }
    };
  },
  normalizeError(error: unknown) {
    return normalizeConnectorError(error);
  }
};

function buildGreenhouseRequest(input: AtsConnectorSendInput, connectorLabel: string) {
  return {
    connector: connectorLabel,
    endpoint: `${input.connectorConfig?.baseUrl ?? "https://greenhouse.stub.local"}/v1/candidates/import`,
    exportId: input.context.exportId,
    job: {
      id: input.exportPackage.job.id,
      title: input.exportPackage.job.title
    },
    candidates: input.exportPackage.recruiterHandoffPackets.map((packet) => {
      const record = packet as {
        candidate?: { fullName?: string; veteranProfileId?: string };
        match?: { score?: number };
        handoffSummary?: { whyRecommended?: string };
      };
      return {
        veteranProfileId: record.candidate?.veteranProfileId ?? null,
        fullName: record.candidate?.fullName ?? "Unknown Veteran",
        matchScore: record.match?.score ?? null,
        summary: record.handoffSummary?.whyRecommended ?? "No summary"
      };
    }),
    simulationMode: input.simulationMode
  };
}

function makeGreenhouseLikeAdapter(target: AtsConnectorType, externalSource: string): AtsConnectorAdapter {
  return {
    target,
    validateConfiguration(input) {
      if (target === "greenhouse_stub") {
        return { ok: true, errors: [] };
      }
      return validateConfiguredConnectorConfig(input);
    },
    prepareRequest(input: AtsConnectorSendInput) {
      return buildGreenhouseRequest(input, target);
    },
    async sendExport(input: AtsConnectorSendInput): Promise<AtsConnectorSendResult> {
      if (input.simulationMode === "retryable_failure") {
        throw new AtsConnectorError({
          message: `${target} simulated temporary upstream outage.`,
          retryable: true,
          errorType: "EXTERNAL_DEPENDENCY_ERROR",
          details: { httpStatus: 503, connector: target }
        });
      }
      if (input.simulationMode === "non_retryable_failure") {
        throw new AtsConnectorError({
          message: `${target} simulated payload validation failure.`,
          retryable: false,
          errorType: "VALIDATION_ERROR",
          details: { httpStatus: 422, connector: target }
        });
      }

      const externalId = deterministicExternalId(
        target === "greenhouse_stub" ? "gh_export" : `${target}_export`,
        `${input.context.exportId}:${input.context.requestFingerprint}`
      );
      const requestId = deterministicExternalId(
        target === "greenhouse_stub" ? "gh_req" : `${target}_req`,
        `${input.context.exportId}:${input.exportPackage.meta.candidateCount}`
      );

      return {
        status: "exported",
        externalSource,
        externalId,
        requestPayload: this.prepareRequest(input),
        responseSummary: {
          connector: target,
          requestId,
          accepted: input.exportPackage.meta.candidateCount,
          rejected: 0,
          simulated: true
        }
      };
    },
    normalizeError(error: unknown) {
      return normalizeConnectorError(error);
    }
  };
}

const leverAdapter: AtsConnectorAdapter = {
  target: "lever",
  validateConfiguration: validateConfiguredConnectorConfig,
  prepareRequest(input) {
    return {
      connector: "lever",
      endpoint: `${input.connectorConfig?.baseUrl ?? "https://api.lever.local"}/opportunities/import`,
      exportId: input.context.exportId,
      candidateCount: input.exportPackage.meta.candidateCount,
      simulationMode: input.simulationMode
    };
  },
  async sendExport(input) {
    if (input.simulationMode !== "success") {
      throw new AtsConnectorError({
        message: "lever simulated failure.",
        retryable: input.simulationMode === "retryable_failure",
        errorType:
          input.simulationMode === "retryable_failure"
            ? "EXTERNAL_DEPENDENCY_ERROR"
            : "VALIDATION_ERROR",
        details: { connector: "lever" }
      });
    }
    return {
      status: "exported",
      externalSource: "lever",
      externalId: deterministicExternalId("lever_export", input.context.requestFingerprint),
      requestPayload: this.prepareRequest(input),
      responseSummary: { connector: "lever", simulated: true, accepted: input.exportPackage.meta.candidateCount }
    };
  },
  normalizeError(error) {
    return normalizeConnectorError(error);
  }
};

const workdayAdapter: AtsConnectorAdapter = {
  target: "workday",
  validateConfiguration: validateConfiguredConnectorConfig,
  prepareRequest(input) {
    return {
      connector: "workday",
      endpoint: `${input.connectorConfig?.baseUrl ?? "https://workday.local"}/recruiting/candidates/import`,
      exportId: input.context.exportId,
      candidateCount: input.exportPackage.meta.candidateCount,
      simulationMode: input.simulationMode
    };
  },
  async sendExport(input) {
    if (input.simulationMode !== "success") {
      throw new AtsConnectorError({
        message: "workday simulated failure.",
        retryable: input.simulationMode === "retryable_failure",
        errorType:
          input.simulationMode === "retryable_failure"
            ? "EXTERNAL_DEPENDENCY_ERROR"
            : "VALIDATION_ERROR",
        details: { connector: "workday" }
      });
    }
    return {
      status: "exported",
      externalSource: "workday",
      externalId: deterministicExternalId("workday_export", input.context.requestFingerprint),
      requestPayload: this.prepareRequest(input),
      responseSummary: { connector: "workday", simulated: true, accepted: input.exportPackage.meta.candidateCount }
    };
  },
  normalizeError(error) {
    return normalizeConnectorError(error);
  }
};

const adaptersByTarget = new Map<AtsConnectorType, AtsConnectorAdapter>([
  [manualHandoffAdapter.target, manualHandoffAdapter],
  ["greenhouse_stub", makeGreenhouseLikeAdapter("greenhouse_stub", "greenhouse_stub")],
  ["greenhouse", makeGreenhouseLikeAdapter("greenhouse", "greenhouse")],
  [leverAdapter.target, leverAdapter],
  [workdayAdapter.target, workdayAdapter]
]);

export function getAtsConnectorAdapter(target: AtsConnectorType) {
  return adaptersByTarget.get(target) ?? null;
}

export function supportedAtsConnectorTargets(): AtsConnectorType[] {
  return [...adaptersByTarget.keys()];
}

export type ConnectorConfigurationValidationResult = {
  ok: boolean;
  errors: string[];
};

export function validateConnectorConfiguration(input: {
  connectorType: AtsConnectorType;
  connectorConfig: ConnectorConfigRecord | null;
}): ConnectorConfigurationValidationResult {
  const adapter = getAtsConnectorAdapter(input.connectorType);
  if (!adapter) {
    return {
      ok: false,
      errors: [`Unsupported connector target: ${input.connectorType}`]
    };
  }
  return adapter.validateConfiguration({
    connectorConfig: input.connectorConfig
  });
}
