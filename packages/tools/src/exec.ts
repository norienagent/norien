import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Cross-platform process primitives, shared by the tool executor and the agent
 * runtime's execution planner so binary resolution lives in exactly one place.
 *
 * On Windows, `node`/`python` resolve `.exe` implicitly but package managers
 * ship as `.cmd`/`.bat` shims that Node cannot spawn without a shell. These
 * helpers hide that difference.
 */

export function executableCandidates(binary: string): string[] {
  if (process.platform !== 'win32') return [binary];
  // `.exe` first: a real executable runs without a shell, avoiding both the
  // shell-argument deprecation warning and shell quoting. Package managers that
  // ship only as `.cmd`/`.bat` shims still resolve on the later candidates.
  return [`${binary}.exe`, `${binary}.cmd`, `${binary}.bat`, binary];
}

/** A batch shim needs a shell on Windows; nothing else does. */
export function needsShell(command: string): boolean {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
}

export interface ResolvedBinary {
  /** The name that actually launches, e.g. `npm.cmd` on Windows. */
  executable: string;
  version: string;
}

/** Finds a runnable binary and its version, or null when it is not on PATH. */
export async function resolveBinary(
  binary: string,
  args: string[] = ['--version'],
): Promise<ResolvedBinary | null> {
  for (const candidate of executableCandidates(binary)) {
    try {
      const { stdout, stderr } = await run(candidate, args, {
        timeout: 5000,
        windowsHide: true,
        shell: needsShell(candidate),
      });
      const output = `${stdout}${stderr}`.trim();
      return { executable: candidate, version: output === '' ? candidate : (output.split(/\r?\n/)[0] as string) };
    } catch {
      // Try the next extension.
    }
  }

  return null;
}

export interface SpawnJsonResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}

/**
 * Runs a child process, writes `stdinPayload` to its stdin, and collects its
 * output. This is the transport for the tool plugin protocol: the runtime
 * hands a tool JSON on stdin and reads JSON from stdout.
 */
export function spawnJson(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: Record<string, string>;
    stdin: string;
    timeoutMs: number;
    maxOutputBytes?: number;
  },
): Promise<SpawnJsonResult> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: needsShell(command),
      });
    } catch (error) {
      reject(error);
      return;
    }

    const maxBytes = options.maxOutputBytes ?? 5_000_000;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs);
    timer.unref?.();

    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      if (stdout.length < maxBytes) stdout += chunk;
    });

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      if (stderr.length < maxBytes) stderr += chunk;
    });

    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code, signal, timedOut });
    });

    // The tool reads its input from stdin, so close the pipe once written.
    child.stdin?.on('error', () => {
      // The child may exit before reading stdin; that surfaces via close/error.
    });
    child.stdin?.end(options.stdin);
  });
}
