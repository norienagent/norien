/**
 * Tool error taxonomy.
 *
 * Mirrors the registry and runtime error shapes: a stable `code`, structured
 * `details`, and an actionable `hint`, so the CLI, the executor, and any future
 * remote tool host all render a failure the same way.
 */

export type ToolErrorCode =
  | 'MANIFEST_INVALID'
  | 'TOOL_NOT_INSTALLED'
  | 'TOOL_ALREADY_INSTALLED'
  | 'RUNTIME_UNSUPPORTED'
  | 'INPUT_INVALID'
  | 'OUTPUT_INVALID'
  | 'PERMISSION_DENIED'
  | 'ENVIRONMENT_INCOMPLETE'
  | 'DEPENDENCY_MISSING'
  | 'EXECUTION_FAILED'
  | 'INTERNAL';

export interface ToolErrorDetail {
  field?: string;
  message: string;
  [key: string]: unknown;
}

export class ToolError extends Error {
  readonly code: ToolErrorCode;
  readonly details: ToolErrorDetail[];
  readonly hint: string | null;
  override readonly cause?: unknown;

  constructor(
    code: ToolErrorCode,
    message: string,
    options: { details?: ToolErrorDetail[]; hint?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.details = options.details ?? [];
    this.hint = options.hint ?? null;
    this.cause = options.cause;
  }

  static notInstalled(slug: string): ToolError {
    return new ToolError('TOOL_NOT_INSTALLED', `Tool '${slug}' is not installed in this workspace.`, {
      hint: `Install it with: norien tool install ${slug}`,
    });
  }

  /** Message plus each detail and the hint, one per line. */
  format(): string {
    const lines = [this.message];
    for (const detail of this.details) {
      lines.push(detail.field ? `  ${detail.field}: ${detail.message}` : `  ${detail.message}`);
    }
    if (this.hint) lines.push(`  ${this.hint}`);
    return lines.join('\n');
  }
}

export function isToolError(error: unknown): error is ToolError {
  return error instanceof ToolError;
}
