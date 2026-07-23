import chalk from 'chalk';
import ora, { type Ora } from 'ora';

import { NorienError } from '@norien-live/sdk';

/**
 * Terminal output.
 *
 * Every command routes through here so two guarantees hold everywhere:
 * `--json` emits nothing but a single JSON document on stdout, and human
 * output degrades cleanly when stdout is not a TTY (piped, redirected, CI).
 */

export interface OutputOptions {
  json: boolean;
  quiet: boolean;
}

let options: OutputOptions = { json: false, quiet: false };

export function configureOutput(next: Partial<OutputOptions>): void {
  options = { ...options, ...next };
}

export function isJsonMode(): boolean {
  return options.json;
}

const isTty = (): boolean => process.stdout.isTTY === true;

export const styles = {
  title: (text: string) => chalk.bold(text),
  dim: (text: string) => chalk.dim(text),
  key: (text: string) => chalk.cyan(text),
  ok: (text: string) => chalk.green(text),
  warn: (text: string) => chalk.yellow(text),
  error: (text: string) => chalk.red(text),
  code: (text: string) => chalk.magenta(text),
};

/** Human-readable line. Suppressed entirely in `--json` mode. */
export function line(text = ''): void {
  if (options.json || options.quiet) return;
  process.stdout.write(`${text}\n`);
}

export function heading(text: string): void {
  line();
  line(styles.title(text));
}

export function success(text: string): void {
  line(`${styles.ok('✓')} ${text}`);
}

export function warn(text: string): void {
  if (options.json) return;
  process.stderr.write(`${styles.warn('!')} ${text}\n`);
}

/** The single JSON document written in `--json` mode. */
export function emitJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

/**
 * Spinner that degrades outside a TTY.
 *
 * Animation is dropped when output is piped or in CI, but terminal states
 * (`succeed`, `fail`, `warn`) still print a plain line: those often carry a
 * command's only confirmation, and silently swallowing them makes a successful
 * run look like it did nothing. `--json` and `--quiet` stay fully silent.
 */
export function spinner(text: string): Ora {
  if (options.json || options.quiet || !isTty()) {
    return createFallbackSpinner();
  }

  return ora({ text, stream: process.stderr });
}

function createFallbackSpinner(): Ora {
  const emit = (symbol: string, message?: string) => {
    if (!options.json && !options.quiet && message) {
      process.stderr.write(`${symbol} ${message}\n`);
    }
    return fallback;
  };

  const fallback = {
    text: '',
    start: () => fallback,
    stop: () => fallback,
    succeed: (message?: string) => emit(styles.ok('✓'), message),
    fail: (message?: string) => emit(styles.error('✗'), message),
    warn: (message?: string) => emit(styles.warn('!'), message),
    info: (message?: string) => emit(styles.dim('·'), message),
  } as unknown as Ora;

  return fallback;
}

/** Aligned key/value block, the shape used by `info`, `whoami`, and `doctor`. */
export function definitions(entries: [string, string | null | undefined][]): void {
  const present = entries.filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (present.length === 0) return;

  const width = Math.max(...present.map(([key]) => key.length));

  for (const [key, value] of present) {
    line(`  ${styles.key(key.padEnd(width))}  ${value}`);
  }
}

export interface Column<T> {
  header: string;
  value: (row: T) => string;
  align?: 'left' | 'right';
}

/**
 * Plain aligned table.
 *
 * Columns whose every cell is empty are dropped, which is how `downloads`
 * appears automatically once the registry serves it and stays invisible until
 * then, with no separate code path.
 */
export function table<T>(rows: T[], columns: Column<T>[]): void {
  if (rows.length === 0) return;

  const rendered = columns.map((column) => ({
    column,
    cells: rows.map((row) => column.value(row) ?? ''),
  }));

  const visible = rendered.filter((entry) => entry.cells.some((cell) => cell.trim() !== ''));
  if (visible.length === 0) return;

  const widths = visible.map((entry) =>
    Math.max(entry.column.header.length, ...entry.cells.map((cell) => stringWidth(cell))),
  );

  const pad = (text: string, width: number, align: 'left' | 'right' = 'left') => {
    const padding = ' '.repeat(Math.max(0, width - stringWidth(text)));
    return align === 'right' ? padding + text : text + padding;
  };

  line(
    styles.dim(
      visible
        .map((entry, index) => pad(entry.column.header.toUpperCase(), widths[index] as number, entry.column.align))
        .join('  ')
        .trimEnd(),
    ),
  );

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    line(
      visible
        .map((entry, index) =>
          pad(entry.cells[rowIndex] ?? '', widths[index] as number, entry.column.align),
        )
        .join('  ')
        .trimEnd(),
    );
  }
}

/** Chalk adds escape codes that must not count toward column width. */
function stringWidth(text: string): number {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\[[0-9;]*m/g, '').length;
}

/** Compact relative time, e.g. "3d ago". */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  const units: [number, string][] = [
    [60, 's'],
    [3600, 'm'],
    [86_400, 'h'],
    [2_592_000, 'd'],
    [31_536_000, 'mo'],
  ];

  if (seconds < 60) return `${seconds}s ago`;

  for (let index = 1; index < units.length; index += 1) {
    const [limit] = units[index] as [number, string];
    if (seconds < limit) {
      const [divisor] = units[index - 1] as [number, string];
      return `${Math.floor(seconds / divisor)}${units[index]?.[1]} ago`;
    }
  }

  return `${Math.floor(seconds / 31_536_000)}y ago`;
}

/** Thrown by commands to exit with a message and a specific status code. */
export class CliError extends Error {
  readonly exitCode: number;
  readonly details: string[];

  constructor(message: string, options: { exitCode?: number; details?: string[] } = {}) {
    super(message);
    this.name = 'CliError';
    this.exitCode = options.exitCode ?? 1;
    this.details = options.details ?? [];
  }
}

/** Renders any failure and returns the process exit code. */
export function reportError(error: unknown): number {
  if (error instanceof NorienError) {
    if (options.json) {
      emitJson({
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          request_id: error.requestId,
          status: error.status,
        },
      });
      return error.isNotFound ? 4 : 1;
    }

    process.stderr.write(`${styles.error('✗')} ${error.message}\n`);

    for (const detail of error.details) {
      process.stderr.write(
        `  ${styles.dim(detail.field ? `${detail.field}:` : '-')} ${detail.message}\n`,
      );
    }

    if (error.isNetworkError) {
      process.stderr.write(
        `\n  ${styles.dim('Is the registry running? Check with')} ${styles.code('norien doctor')}\n`,
      );
    }

    if (error.isUnauthorized) {
      process.stderr.write(`\n  ${styles.dim('Try')} ${styles.code('norien login')}\n`);
    }

    if (error.requestId) {
      process.stderr.write(`  ${styles.dim(`request id: ${error.requestId}`)}\n`);
    }

    return error.isNotFound ? 4 : 1;
  }

  if (error instanceof CliError) {
    if (options.json) {
      emitJson({ ok: false, error: { code: 'CLI_ERROR', message: error.message, details: error.details } });
      return error.exitCode;
    }

    process.stderr.write(`${styles.error('✗')} ${error.message}\n`);
    for (const detail of error.details) process.stderr.write(`  ${styles.dim('-')} ${detail}\n`);
    return error.exitCode;
  }

  const message = error instanceof Error ? error.message : String(error);

  if (options.json) {
    emitJson({ ok: false, error: { code: 'UNEXPECTED', message } });
  } else {
    process.stderr.write(`${styles.error('✗')} ${message}\n`);
  }

  return 1;
}
