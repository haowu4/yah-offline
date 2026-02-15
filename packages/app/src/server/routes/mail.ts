import { Router } from "express"
import { AppCtx } from "../../appCtx.js"

export function createMailRouter(ctx: AppCtx) {
    const router = Router()

    router.post("/mail-thread", (req, res) => {
        // TODO: post a new message to create a thread
    })

    router.post("/mail-thread/:thread_id", (req, res) => {
        // TODO: post a new message to a thread
    })


    router.get("/mail-thread/:thread_id/stream", (req, res) => {
        // TODO: listen to thread stream for llm generated replies.
    })

    router.get("/mail-thread/:thread_id/stream", (req, res) => {
        // TODO: listen to thread stream for llm generated replies.
    })



    return router
}