/**
 * Structured JSON logger for Lambda.
 * Outputs one JSON object per line with consistent fields.
 */

interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
  correlationId?: string;
  [key: string]: unknown;
}

let currentCorrelationId: string | undefined;

export function setCorrelationId(id: string): void {
  currentCorrelationId = id;
}

export function clearCorrelationId(): void {
  currentCorrelationId = undefined;
}

function formatEntry(
  level: string,
  message: string,
  data?: Record<string, unknown>
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(currentCorrelationId && { correlationId: currentCorrelationId }),
    ...data,
  };
}

export const logger = {
  info(message: string, data?: Record<string, unknown>): void {
    console.log(JSON.stringify(formatEntry("INFO", message, data)));
  },

  warn(message: string, data?: Record<string, unknown>): void {
    console.warn(JSON.stringify(formatEntry("WARN", message, data)));
  },

  error(message: string, data?: Record<string, unknown>): void {
    console.error(JSON.stringify(formatEntry("ERROR", message, data)));
  },
};
