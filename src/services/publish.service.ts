import { AppError } from '../core/errors.js';
import type { Principal } from '../core/principal.js';
import type { Database } from '../db/client.js';
import { AgentService, type AgentResponse } from './agent.service.js';
import { ToolService, type ToolResponse } from './tool.service.js';
import { parseOrThrow } from '../validation/parse.js';
import { createAgentSchema } from '../validation/agent.schema.js';
import { createToolSchema } from '../validation/tool.schema.js';

export type PublishResult =
  | { type: 'agent'; agent: AgentResponse }
  | { type: 'tool'; tool: ToolResponse };

/**
 * `POST /publish` -- the endpoint a CLI will target.
 *
 * It is deliberately upsert-shaped: first publish creates, later publishes
 * append a version. That is what makes `norien publish` a single idempotent
 * command rather than "create if new, otherwise version".
 */
export class PublishService {
  private readonly agents: AgentService;
  private readonly tools: ToolService;

  constructor(db: Database) {
    this.agents = new AgentService(db);
    this.tools = new ToolService(db);
  }

  async publish(body: unknown, principal: Principal): Promise<PublishResult> {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw AppError.badRequest('The publish payload must be a JSON object.');
    }

    const payload = body as Record<string, unknown>;
    const type = this.resolveType(payload);

    if (type === 'tool') {
      const input = parseOrThrow(createToolSchema, stripType(payload));
      return { type: 'tool', tool: await this.tools.publish(input, principal) };
    }

    const input = parseOrThrow(createAgentSchema, stripType(payload));
    return { type: 'agent', agent: await this.agents.publish(input, principal) };
  }

  /**
   * The `type` field is optional: a payload carrying a manifest or
   * `required_tools` is unambiguously an agent, and one carrying schemas is a
   * tool. Explicit `type` always wins.
   */
  private resolveType(payload: Record<string, unknown>): 'agent' | 'tool' {
    if (payload.type === 'agent' || payload.type === 'tool') return payload.type;

    if ('input_schema' in payload || 'output_schema' in payload) return 'tool';
    if ('manifest' in payload || 'required_tools' in payload) return 'agent';

    throw AppError.badRequest(
      "Unable to infer what is being published. Set `type` to 'agent' or 'tool'.",
      [{ field: 'type', message: "Expected 'agent' or 'tool'." }],
    );
  }
}

function stripType(payload: Record<string, unknown>): Record<string, unknown> {
  const { type: _type, ...rest } = payload;
  return rest;
}
