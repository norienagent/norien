import { EventEmitter } from 'node:events';
import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type { LogRecord, LogStream } from './types.js';

/**
 * Log Manager.
 *
 * Each agent gets a bounded in-memory ring buffer for instant `tail`, and an
 * append-only JSONL file per run for durable history. The two serve different
 * needs on purpose: memory answers `norien logs` immediately without touching
 * disk, and the file survives a supervisor restart so a crash can still be
 * investigated afterwards.
 *
 * JSONL rather than plain text because every line carries a timestamp, stream,
 * and run id -- structure a text log would lose.
 */

const DEFAULT_BUFFER_SIZE = 2000;
const LOGS_DIRNAME = '.norien/logs';

export interface LogSubscription {
  close: () => void;
}

export class LogManager extends EventEmitter {
  private readonly buffers = new Map<string, LogRecord[]>();
  private readonly writers = new Map<string, WriteStream>();
  private readonly bufferSize: number;

  constructor(options: { bufferSize?: number } = {}) {
    super();
    // One listener per follower, plus internal ones; the default cap of 10 is
    // far too low for a supervisor watching several agents.
    this.setMaxListeners(0);
    this.bufferSize = options.bufferSize ?? DEFAULT_BUFFER_SIZE;
  }

  logDirectory(agentDirectory: string): string {
    return path.join(agentDirectory, LOGS_DIRNAME);
  }

  logFile(agentDirectory: string, runId: string): string {
    return path.join(this.logDirectory(agentDirectory), `${runId}.jsonl`);
  }

  /** Opens the durable log for a run. Safe to call repeatedly. */
  async openRun(slug: string, agentDirectory: string, runId: string): Promise<string> {
    await this.closeRun(slug);

    const directory = this.logDirectory(agentDirectory);
    await mkdir(directory, { recursive: true });

    const file = this.logFile(agentDirectory, runId);
    this.writers.set(slug, createWriteStream(file, { flags: 'a' }));

    return file;
  }

  async closeRun(slug: string): Promise<void> {
    const writer = this.writers.get(slug);
    if (!writer) return;

    this.writers.delete(slug);
    await new Promise<void>((resolve) => writer.end(resolve));
  }

  /**
   * Records one line. Emits before writing so followers see output live rather
   * than at the mercy of disk flushing.
   */
  append(slug: string, record: LogRecord): void {
    const buffer = this.buffers.get(slug) ?? [];
    buffer.push(record);

    // Ring buffer: drop the oldest rather than growing without bound.
    if (buffer.length > this.bufferSize) buffer.splice(0, buffer.length - this.bufferSize);
    this.buffers.set(slug, buffer);

    this.emit('log', slug, record);
    this.emit(`log:${slug}`, record);

    this.writers.get(slug)?.write(`${JSON.stringify(record)}\n`);
  }

  /** Convenience for supervisor-authored lines (start, exit, health). */
  system(slug: string, runId: string, line: string): void {
    this.append(slug, { ts: Date.now(), stream: 'system', line, runId });
  }

  /**
   * Splits a raw chunk into lines.
   *
   * Returns the trailing partial line so the caller can prepend it to the next
   * chunk -- without this, a log line split across two reads would be emitted
   * as two broken lines.
   */
  static splitChunk(carry: string, chunk: string): { lines: string[]; carry: string } {
    const combined = carry + chunk;
    const parts = combined.split(/\r?\n/);
    const remainder = parts.pop() ?? '';

    return { lines: parts, carry: remainder };
  }

  /** Most recent lines from memory, newest last. */
  tail(slug: string, limit = 200, options: { stream?: LogStream } = {}): LogRecord[] {
    const buffer = this.buffers.get(slug) ?? [];
    const filtered = options.stream
      ? buffer.filter((record) => record.stream === options.stream)
      : buffer;

    return filtered.slice(-limit);
  }

  /**
   * Reads history from disk, including runs that ended before this supervisor
   * started. Corrupt lines are skipped rather than failing the whole read.
   */
  async history(
    agentDirectory: string,
    options: { runId?: string; limit?: number } = {},
  ): Promise<LogRecord[]> {
    const directory = this.logDirectory(agentDirectory);

    let files: string[];
    try {
      files = (await readdir(directory)).filter((file) => file.endsWith('.jsonl')).sort();
    } catch {
      return [];
    }

    if (options.runId) {
      files = files.filter((file) => file === `${options.runId}.jsonl`);
    }

    const records: LogRecord[] = [];

    for (const file of files) {
      const raw = await readFile(path.join(directory, file), 'utf8').catch(() => '');

      for (const line of raw.split(/\r?\n/)) {
        if (line.trim() === '') continue;
        try {
          records.push(JSON.parse(line) as LogRecord);
        } catch {
          // A partially written final line is expected while a run is live.
        }
      }
    }

    records.sort((a, b) => a.ts - b.ts);
    return options.limit ? records.slice(-options.limit) : records;
  }

  /** Streams new lines to a listener until it unsubscribes. */
  follow(slug: string, listener: (record: LogRecord) => void): LogSubscription {
    const handler = (record: LogRecord) => listener(record);
    this.on(`log:${slug}`, handler);

    return {
      close: () => {
        this.off(`log:${slug}`, handler);
      },
    };
  }

  clear(slug: string): void {
    this.buffers.delete(slug);
  }

  /** Deletes durable logs for an agent. Used when it is uninstalled. */
  async purge(agentDirectory: string): Promise<void> {
    this.clear(path.basename(agentDirectory));
    await rm(this.logDirectory(agentDirectory), { recursive: true, force: true });
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.writers.keys()].map((slug) => this.closeRun(slug)));
  }
}
