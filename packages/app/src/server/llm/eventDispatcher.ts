import { AppCtx } from "../../appCtx.js"
import { GenerationOrderEvent } from "../../type/order.js"

type Subscriber = {
  id: number
  orderId: number
  send: (args: {
    seq: number
    orderId: number
    event: GenerationOrderEvent
  }) => void
}

export class EventDispatcher {
  private appCtx: AppCtx
  private subscribers = new Map<number, Subscriber>()
  private nextSubscriberId = 1

  constructor(appCtx: AppCtx) {
    this.appCtx = appCtx
  }

  subscribe(args: {
    orderId: number
    send: (payload: {
      seq: number
      orderId: number
      event: GenerationOrderEvent
    }) => void
  }): () => void {
    const id = this.nextSubscriberId
    this.nextSubscriberId += 1

    this.subscribers.set(id, {
      id,
      orderId: args.orderId,
      send: args.send,
    })

    return () => {
      this.subscribers.delete(id)
    }
  }

  emit(args: {
    orderId: number
    event: GenerationOrderEvent
  }): number {
    const searchDB = this.appCtx.dbClients.search()
    const seq = searchDB.appendGenerationEvent(args.orderId, args.event)

    for (const subscriber of this.subscribers.values()) {
      if (subscriber.orderId !== args.orderId) continue

      subscriber.send({
        seq,
        orderId: args.orderId,
        event: args.event,
      })
    }

    return seq
  }

  replayAfter(args: {
    orderId: number
    afterSeq: number
  }): Array<{
    seq: number
    orderId: number
    event: GenerationOrderEvent
  }> {
    const searchDB = this.appCtx.dbClients.search()
    return searchDB.replayOrderEventsAfterSeq(args.orderId, args.afterSeq).map((row) => ({
      seq: row.seq,
      orderId: args.orderId,
      event: row.event,
    }))
  }
}
