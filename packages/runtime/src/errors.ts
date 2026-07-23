/**
 * Runtime error taxonomy.
 *
 * Mirrors the registry's approach: a stable `code` plus structured `details`,
 * so the CLI, the HTTP API, and a future remote worker all render the same
 * failure the same way without parsing message text.
 */

export type RuntimeErrorCode =
  | 'AGENT_NOT_INSTALLED'
  | 'AGENT_NOT_RUNNING'
  | 'ALREADY_RUNNING'
  | 'MANIFEST_INVALID'
  | 'RUNTIME_UNAVAILABLE'
  | 'PERMISSION_DENIED'
  | 'ENVIRONMENT_INCOMPLETE'
  | 'DEPENDENCY_MISSING'
  | 'START_FAILED'
  | 'STOP_FAILED'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<RuntimeErrorCode, number> = {
  AGENT_NOT_INSTALLED: 404,
  AGENT_NOT_RUNNING: 409,
  ALREADY_RUNNING: 409,
  MANIFEST_INVALID: 422,
  RUNTIME_UNAVAILABLE: 422,
  PERMISSION_DENIED: 403,
  ENVIRONMENT_INCOMPLETE: 422,
  DEPENDENCY_MISSING: 422,
  START_FAILED: 500,
  STOP_FAILED: 500,
  INTERNAL: 500,
};

export interface RuntimeErrorDetail {
  field?: string;
  message: string;
  [key: string]: unknown;
}

export class RuntimeError extends Error {
  readonly code: RuntimeErrorCode;
  readonly statusCode: number;
  readonly details: RuntimeErrorDetail[];
  /** Actionable next step, rendered separately from the failure itself. */
  readonly hint: string | null;
  override readonly cause?: unknown;

  constructor(
    code: RuntimeErrorCode,
    message: string,
    options: { details?: RuntimeErrorDetail[]; hint?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'RuntimeError';
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
    this.details = options.details ?? [];
    this.hint = options.hint ?? null;
    this.cause = options.cause;
  }

  static notInstalled(slug: string): RuntimeError {
    return new RuntimeError('AGENT_NOT_INSTALLED', `'${slug}' is not installed in this workspace.`, {
      hint: `Install it with: norien install ${slug}`,
    });
  }

  static notRunning(slug: string): RuntimeError {
    return new RuntimeError('AGENT_NOT_RUNNING', `'${slug}' is not running.`, {
      hint: `Start it with: norien run ${slug}`,
    });
  }

  static alreadyRunning(slug: string, pid: number): RuntimeError {
    return new RuntimeError('ALREADY_RUNNING', `'${slug}' is already running (pid ${pid}).`, {
      hint: `Restart it with: norien restart ${slug}`,
    });
  }

  /** Renders the message plus each detail, one per line. */
  format(): string {
    const lines = [this.message];
    for (const detail of this.details) {
      lines.push(detail.field ? `  ${detail.field}: ${detail.message}` : `  ${detail.message}`);
    }
    if (this.hint) lines.push(`  ${this.hint}`);
    return lines.join('\n');
  }
}

export function isRuntimeError(error: unknown): error is RuntimeError {
  return error instanceof RuntimeError;
}
