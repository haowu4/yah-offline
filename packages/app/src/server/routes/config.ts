import { Router } from "express"
import { AppCtx } from "../../appCtx.js"

export function createConfigRouter(ctx: AppCtx) {
    const router = Router()

    router.post("/", (req, res) => {

        res.json({

        })
    })

    return router
}