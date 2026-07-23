import { AppError, type ErrorDetail } from '../core/errors.js';
import type { ToolRow } from '../db/schema/tools.js';
import type { ToolRepository } from '../repositories/tool.repository.js';
import { unique } from '../validation/manifest.schema.js';

/**
 * Tool metadata as an agent runtime needs it: enough to call the tool without
 * a second round trip to the registry.
 */
export interface ResolvedTool {
  id: string;
  slug: string;
  name: string;
  version: string;
  category: string;
  description: string;
  /** How the tool runs -- carried so the runtime can execute it as a plugin. */
  runtime: string | null;
  entrypoint: string | null;
  authentication: ToolRow['authentication'];
  input_schema: ToolRow['inputSchema'];
  output_schema: ToolRow['outputSchema'];
  permissions: string[];
  environment: ToolRow['environmentVariables'];
}

/** The outcome of resolving an agent's declared tool list. */
export interface ToolResolution {
  /** Requested slugs, de-duplicated, in the publisher's order. */
  requested: string[];
  resolved: ResolvedTool[];
  /** Declared slugs with no published tool behind them. */
  missing: string[];
  satisfied: boolean;
}

function describe(tool: ToolRow): ResolvedTool {
  return {
    id: tool.id,
    slug: tool.slug,
    name: tool.name,
    version: tool.latestVersion,
    category: tool.category,
    description: tool.description,
    runtime: tool.runtime,
    entrypoint: tool.entrypoint,
    authentication: tool.authentication,
    input_schema: tool.inputSchema,
    output_schema: tool.outputSchema,
    permissions: tool.permissions,
    environment: tool.environmentVariables,
  };
}

/**
 * Turns a declared tool list into concrete metadata.
 *
 * The two callers need opposite behaviour from the same logic, which is why
 * this is one service with two entry points rather than duplicated lookups:
 * publishing must *reject* an unsatisfiable agent, while install and runtime
 * inspection must *report* what is missing so a developer can act on it.
 */
export class ToolResolverService {
  constructor(private readonly tools: ToolRepository) {}

  /** Non-throwing resolution. Used by install and runtime inspection. */
  async resolve(slugs: readonly string[]): Promise<ToolResolution> {
    const requested = unique(slugs);

    if (requested.length === 0) {
      return { requested, resolved: [], missing: [], satisfied: true };
    }

    const found = await this.tools.findBySlugs(requested);
    const bySlug = new Map(found.map((tool) => [tool.slug, tool]));

    // Ordered by the publisher's declaration, not by what the database returned.
    const resolved = requested
      .map((slug) => bySlug.get(slug))
      .filter((tool): tool is ToolRow => tool !== undefined)
      .map(describe);

    const missing = requested.filter((slug) => !bySlug.has(slug));

    return { requested, resolved, missing, satisfied: missing.length === 0 };
  }

  /**
   * Throwing resolution. Used at publish time: an agent naming a tool nobody
   * published is unusable, so it is a hard failure rather than a runtime
   * surprise for whoever installs it. Every missing slug is reported at once.
   */
  async require(slugs: readonly string[]): Promise<ToolResolution> {
    const resolution = await this.resolve(slugs);

    if (!resolution.satisfied) {
      const details: ErrorDetail[] = resolution.missing.map((slug) => ({
        field: 'tools',
        message: `Tool '${slug}' is not published in this registry.`,
        slug,
      }));

      throw new AppError(
        'DEPENDENCY_MISSING',
        `${resolution.missing.length} required tool(s) could not be resolved: ${resolution.missing.join(', ')}.`,
        { details },
      );
    }

    return resolution;
  }
}
