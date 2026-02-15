import { Router } from "express"
import { AppCtx } from "../../appCtx.js"

export function createSearchRouter(ctx: AppCtx) {
  const router = Router()

  router.post("/query", (req, res) => {
    // TODO: get the query value, insert to db.
    res.json({
      queryId: ''
    })
  })


  router.get("/query/:query_id/stream", (req, res) => {
    // TODO: 
  })

  router.get("/article", (req, res) => {
    // TODO: list articles
  })

  router.get("/article/:slug", (req, res) => {
    // TODO: 
  })



  return router
}