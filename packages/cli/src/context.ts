import { NorienClient } from '@norien/sdk';

import { type ResolvedCredentials, resolveCredentials } from './config.js';
import { CliError } from './ui.js';

/**
 * Everything a command needs, resolved once per invocation.
 *
 * Commands receive this instead of reaching for configuration themselves, so
 * flag/environment/profile precedence is applied in exactly one place.
 */
export interface CommandContext {
  client: NorienClient;
  credentials: ResolvedCredentials;
  cwd: string;
  json: boolean;
  yes: boolean;
}

export interface GlobalOptions {
  registry?: string;
  profile?: string;
  json?: boolean;
  yes?: boolean;
  quiet?: boolean;
}

export async function createContext(options: GlobalOptions): Promise<CommandContext> {
  const credentials = await resolveCredentials({
    ...(options.registry ? { registry: options.registry } : {}),
    ...(options.profile ? { profile: options.profile } : {}),
  });

  const client = new NorienClient({
    baseUrl: credentials.registry,
    ...(credentials.apiKey ? { apiKey: credentials.apiKey } : {}),
    ...(credentials.handle ? { actor: credentials.handle } : {}),
    userAgent: '@norien/cli',
  });

  return {
    client,
    credentials,
    cwd: process.cwd(),
    json: options.json === true,
    yes: options.yes === true,
  };
}

/**
 * Guards commands that write to the registry.
 *
 * The registry attributes every write to the acting handle, so a publish or
 * install without one would be rejected server-side with a less helpful
 * message than this.
 */
export function requireIdentity(context: CommandContext): string {
  if (!context.credentials.handle) {
    throw new CliError('You are not logged in.', {
      exitCode: 3,
      details: [
        "Run 'norien login' to authenticate.",
        'Or set NORIEN_ACTOR (and NORIEN_API_KEY) for non-interactive use.',
      ],
    });
  }

  return context.credentials.handle;
}
