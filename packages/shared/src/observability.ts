type ServiceName = "web" | "api" | "worker";

export const ERROR_TYPES = {
  validation: "VALIDATION_ERROR",
  system: "SYSTEM_ERROR",
  externalDependency: "EXTERNAL_DEPENDENCY_ERROR"
} as const;

export type ErrorType = (typeof ERROR_TYPES)[keyof typeof ERROR_TYPES];

export class NonRetryableJobError extends Error {
  readonly errorType: ErrorType;

  constructor(message: string, errorType: ErrorType = ERROR_TYPES.validation) {
    super(message);
    this.name = "NonRetryableJobError";
    this.errorType = errorType;
  }
}

export function isRetryableErrorType(errorType: ErrorType) {
  return errorType !== ERROR_TYPES.validation;
}

type LogLevel = "info" | "warn" | "error";

type LogContext = {
  action?: string;
  route?: string;
  status?: string;
  userId?: string;
  jobId?: string;
  queue?: string;
  durationMs?: number;
  errorType?: ErrorType;
  errorMessage?: string;
  errorStack?: string | null;
  [key: string]: unknown;
};

type LogEntry = LogContext & {
  timestamp: string;
  level: LogLevel;
  service: ServiceName;
  event: string;
};

export function classifyError(error: unknown): ErrorType {
  if (error instanceof NonRetryableJobError) {
    return error.errorType;
  }
  if (error && typeof error === "object") {
    const maybeName = "name" in error ? String(error.name) : "";
    if (maybeName === "ZodError") {
      return ERROR_TYPES.validation;
    }
    if (maybeName === "NonRetryableJobError") {
      if ("errorType" in error) {
        const errorTypeValue = String((error as { errorType?: unknown }).errorType);
        if (
          errorTypeValue === ERROR_TYPES.validation ||
          errorTypeValue === ERROR_TYPES.system ||
          errorTypeValue === ERROR_TYPES.externalDependency
        ) {
          return errorTypeValue as ErrorType;
        }
      }
      return ERROR_TYPES.validation;
    }
    const maybeCode = "code" in error ? String(error.code) : "";
    if (["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(maybeCode)) {
      return ERROR_TYPES.externalDependency;
    }
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  if (
    message.includes("timeout") ||
    message.includes("redis") ||
    message.includes("postgres") ||
    message.includes("database") ||
    message.includes("openai") ||
    message.includes("network")
  ) {
    return ERROR_TYPES.externalDependency;
  }

  return ERROR_TYPES.system;
}

export function normalizeError(error: unknown) {
  const errorType = classifyError(error);
  const errorMessage = error instanceof Error ? error.message : String(error ?? "Unknown error");
  const errorStack = error instanceof Error ? (error.stack ?? null) : null;
  return { errorType, errorMessage, errorStack };
}

export function isRetryableError(error: unknown) {
  const { errorType } = normalizeError(error);
  return isRetryableErrorType(errorType);
}

function emitLog(entry: LogEntry) {
  const serialized = JSON.stringify(entry);
  if (entry.level === "error") {
    console.error(serialized);
    return;
  }
  console.log(serialized);
}

function buildEntry(service: ServiceName, level: LogLevel, event: string, context: LogContext): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    service,
    event,
    ...context
  };
}

export function createLogger(service: ServiceName) {
  return {
    info(event: string, context: LogContext = {}) {
      emitLog(buildEntry(service, "info", event, context));
    },
    warn(event: string, context: LogContext = {}) {
      emitLog(buildEntry(service, "warn", event, context));
    },
    error(event: string, error: unknown, context: LogContext = {}) {
      const normalized = normalizeError(error);
      emitLog(
        buildEntry(service, "error", event, {
          ...context,
          ...normalized
        })
      );
    },
    timed(event: string, context: LogContext = {}) {
      const start = Date.now();
      this.info(event, {
        ...context,
        status: context.status ?? "start"
      });
      return {
        success: (extra: LogContext = {}) =>
          this.info(event, {
            ...context,
            ...extra,
            status: "success",
            durationMs: Date.now() - start
          }),
        fail: (error: unknown, extra: LogContext = {}) =>
          this.error(event, error, {
            ...context,
            ...extra,
            status: "fail",
            durationMs: Date.now() - start
          })
      };
    }
  };
}

export const apiLogger = createLogger("api");
export const workerLogger = createLogger("worker");
