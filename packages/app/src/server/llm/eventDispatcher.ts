import { AppCtx } from "../../appCtx.js"
import { LLMEventPayloadByTopic, LLMEventTopic } from "../../type/llm.js"

type Subscriber<T extends LLMEventTopic> = {
  id: number
  topic: T
  entityId?: string
  send: (args: {
    id: number
    topic: T
    entityId: string
    event: LLMEventPayloadByTopic[T]
  }) => void
}

export class EventDispatcher {
  private appCtx: AppCtx
  private subscribers = new Map<number, Subscriber<LLMEventTopic>>()
  private nextSubscriberId = 1

  constructor(appCtx: AppCtx) {
    this.appCtx = appCtx
  }

  subscribe<T extends LLMEventTopic>(args: {
    topic: T
    entityId?: string
    send: (payload: {
      id: number
      topic: T
      entityId: string
      event: LLMEventPayloadByTopic[T]
    }) => void
  }): () => void {
    const id = this.nextSubscriberId
    this.nextSubscriberId += 1

    this.subscribers.set(id, {
      id,
      topic: args.topic,
      entityId: args.entityId,
      send: args.send as Subscriber<LLMEventTopic>["send"],
    })

    return () => {
      this.subscribers.delete(id)
    }
  }

  emit<T extends LLMEventTopic>(args: {
    topic: T
    entityId: string
    event: LLMEventPayloadByTopic[T]
  }): number {
    const llmDB = this.appCtx.dbClients.llm()
    const eventId = llmDB.appendEvent({
      topic: args.topic,
      entityId: args.entityId,
      eventType: args.event.type,
      payload: args.event,
    })

    for (const subscriber of this.subscribers.values()) {
      if (subscriber.topic !== args.topic) continue
      if (subscriber.entityId && subscriber.entityId !== args.entityId) continue

      subscriber.send({
        id: eventId,
        topic: args.topic,
        entityId: args.entityId,
        event: args.event,
      })
    }

    return eventId
  }

  replayAfter<T extends LLMEventTopic>(args: {
    topic: T
    lastEventId: number
    entityId?: string
  }): Array<{
    id: number
    topic: T
    entityId: string
    event: LLMEventPayloadByTopic[T]
  }> {
    const llmDB = this.appCtx.dbClients.llm()
    const rows = llmDB.listEventsAfterId({
      lastId: args.lastEventId,
      topic: args.topic,
      entityId: args.entityId,
    })

    return rows.flatMap((row) => {
      try {
        return [
          {
            id: row.id,
            topic: args.topic,
            entityId: row.entityId,
            event: JSON.parse(row.payloadJson) as LLMEventPayloadByTopic[T],
          },
        ]
      } catch {
        return []
      }
    })
  }
}
