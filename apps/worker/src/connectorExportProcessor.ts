import { and, eq } from "drizzle-orm";
import {
  companyAtsConnectors,
  createDbClient,
  jobCandidateExports
} from "@boots2suits/db";
import {
  getAtsConnectorAdapter,
  validateConnectorConfiguration,
  NonRetryableJobError,
  isRetryableErrorType,
  normalizeError,
  type AtsConnectorType,
  type ConnectorSimulationMode,
  type ConnectorConfigRecord
} from "@boots2suits/shared";

type Db = ReturnType<typeof createDbClient>["db"];

export async function processConnectorExportJob(
  db: Db,
  payload: {
    exportId: string;
    connectorType: AtsConnectorType;
    requestedByUserId: string;
    simulationMode: ConnectorSimulationMode;
  },
  context: { attemptNumber: number; maxAttempts: number; startedAt: number }
) {
  const [exportRow] = await db
    .select({
      id: jobCandidateExports.id,
      jobId: jobCandidateExports.jobId,
      exportStatus: jobCandidateExports.exportStatus,
      exportFormat: jobCandidateExports.exportFormat,
      requestFingerprint: jobCandidateExports.requestFingerprint,
      exportedByUserId: jobCandidateExports.exportedByUserId,
      connectorType: jobCandidateExports.connectorType,
      companyConnectorId: jobCandidateExports.companyConnectorId,
      payload: jobCandidateExports.payload,
      connectorAttempts: jobCandidateExports.connectorAttempts
    })
    .from(jobCandidateExports)
    .where(eq(jobCandidateExports.id, payload.exportId))
    .limit(1);
  if (!exportRow) {
    throw new NonRetryableJobError("Connector export record not found.", "VALIDATION_ERROR");
  }
  if (exportRow.exportStatus === "exported") {
    return;
  }

  const adapter = getAtsConnectorAdapter(payload.connectorType);
  if (!adapter) {
    throw new NonRetryableJobError("Unsupported connector adapter.", "VALIDATION_ERROR");
  }
  const nextAttempt = (exportRow.connectorAttempts ?? 0) + 1;

  let connectorConfig: ConnectorConfigRecord | null = null;
  if (exportRow.companyConnectorId) {
    const [config] = await db
      .select({
        connectorType: companyAtsConnectors.connectorType,
        enabled: companyAtsConnectors.enabled,
        environment: companyAtsConnectors.environment,
        baseUrl: companyAtsConnectors.baseUrl,
        authMode: companyAtsConnectors.authMode,
        credentialConfigured: companyAtsConnectors.credentialConfigured,
        credentialReference: companyAtsConnectors.credentialReference,
        configMetadata: companyAtsConnectors.configMetadata,
        fieldMappings: companyAtsConnectors.fieldMappings
      })
      .from(companyAtsConnectors)
      .where(eq(companyAtsConnectors.id, exportRow.companyConnectorId))
      .limit(1);
    connectorConfig = (config ?? null) as ConnectorConfigRecord | null;
  }

  const configValidation = validateConnectorConfiguration({
    connectorType: payload.connectorType,
    connectorConfig
  });
  if (!configValidation.ok) {
    throw new NonRetryableJobError(configValidation.errors.join(" "), "VALIDATION_ERROR");
  }

  await db
    .update(jobCandidateExports)
    .set({
      exportStatus: "processing",
      connectorStartedAt: new Date(),
      connectorAttempts: nextAttempt,
      connectorRetryCount: Math.max(0, nextAttempt - 1),
      connectorLastRetriedAt: nextAttempt > 1 ? new Date() : null,
      connectorFailedAt: null,
      connectorCompletedAt: null,
      errorType: null,
      errorMessage: null
    })
    .where(eq(jobCandidateExports.id, payload.exportId));

  try {
    const packagePayload =
      exportRow.payload && typeof exportRow.payload === "object"
        ? (exportRow.payload as Record<string, unknown>)
        : null;
    if (!packagePayload) {
      throw new NonRetryableJobError("Connector export payload is missing.", "VALIDATION_ERROR");
    }

    const connectorInput = {
      context: {
        exportId: exportRow.id,
        jobId: exportRow.jobId,
        exportFormat: exportRow.exportFormat as "json" | "csv",
        requestFingerprint: exportRow.requestFingerprint ?? `export:${exportRow.id}`,
        requestedByUserId: exportRow.exportedByUserId ?? payload.requestedByUserId
      },
      exportPackage: packagePayload as any,
      simulationMode: payload.simulationMode,
      connectorConfig
    };
    const connectorRequestPayload = adapter.prepareRequest(connectorInput);
    const connectorResult = await adapter.sendExport(connectorInput);

    await db
      .update(jobCandidateExports)
      .set({
        exportStatus: "exported",
        connectorRequestPayload,
        connectorResponseSummary: connectorResult.responseSummary,
        externalSource: connectorResult.externalSource,
        externalId: connectorResult.externalId,
        connectorCompletedAt: new Date(),
        connectorDurationMs: Date.now() - context.startedAt,
        errorType: null,
        errorMessage: null,
        exportedAt: new Date()
      })
      .where(eq(jobCandidateExports.id, payload.exportId));
  } catch (error) {
    const normalized = adapter.normalizeError(error);
    const retryable = isRetryableErrorType(normalized.errorType);
    const isFinalAttempt = !retryable || context.attemptNumber >= context.maxAttempts;

    await db
      .update(jobCandidateExports)
      .set({
        exportStatus: isFinalAttempt ? "failed" : "queued",
        connectorFailedAt: new Date(),
        connectorDurationMs: Date.now() - context.startedAt,
        errorType: normalized.errorType,
        errorMessage: normalized.errorMessage,
        connectorResponseSummary: normalized.details
          ? { status: "failed", ...normalized.details }
          : { status: "failed" }
      })
      .where(eq(jobCandidateExports.id, payload.exportId));

    if (!retryable) {
      throw new NonRetryableJobError(normalized.errorMessage, normalized.errorType);
    }
    throw error;
  }
}
