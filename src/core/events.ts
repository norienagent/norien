/**
 * In-process domain event bus.
 *
 * Services publish facts here instead of calling side-effectful code directly.
 * Today the events are only logged, but this is the seam where webhooks, download
 * counters, search re-indexing, and audit logs attach later -- without those
 * features leaking into service code.
 */

export type DomainEvent =
  | { type: 'agent.published'; agentId: string; slug: string; version: string; actorId: string | null }
  | { type: 'agent.updated'; agentId: string; slug: string; actorId: string | null }
  | { type: 'agent.deleted'; agentId: string; slug: string; actorId: string | null }
  | { type: 'agent.installed'; agentId: string; slug: string; version: string; userId: string }
  | { type: 'agent.uninstalled'; agentId: string; slug: string; userId: string }
  | { type: 'tool.published'; toolId: string; slug: string; version: string; actorId: string | null }
  | { type: 'tool.updated'; toolId: string; slug: string; actorId: string | null }
  | { type: 'tool.deleted'; toolId: string; slug: string; actorId: string | null };

export type DomainEventType = DomainEvent['type'];

type Handler<E extends DomainEvent = DomainEvent> = (event: E) => void | Promise<void>;

class EventBus {
  readonly #handlers = new Map<DomainEventType | '*', Set<Handler>>();

  on<T extends DomainEventType>(
    type: T | '*',
    handler: Handler<Extract<DomainEvent, { type: T }>>,
  ): () => void {
    const existing = this.#handlers.get(type) ?? new Set<Handler>();
    existing.add(handler as Handler);
    this.#handlers.set(type, existing);
    return () => existing.delete(handler as Handler);
  }

  /**
   * Fire and forget. Subscriber failures must never fail the originating
   * request, so rejections are swallowed and reported through `onError`.
   */
  emit(event: DomainEvent): void {
    const targets = [
      ...(this.#handlers.get(event.type) ?? []),
      ...(this.#handlers.get('*') ?? []),
    ];

    for (const handler of targets) {
      void Promise.resolve()
        .then(() => handler(event))
        .catch((error: unknown) => this.onError(event, error));
    }
  }

  onError: (event: DomainEvent, error: unknown) => void = () => {};
}

export const events = new EventBus();
