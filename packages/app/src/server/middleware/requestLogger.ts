import type { Request, Response, NextFunction } from "express"
import { createRequestId, isDebugEnabled, logDebugJson, logLine } from "../../logging/index.js"

function formatIp(req: Request): string {
  if (typeof req.ip === "string" && req.ip.trim()) return req.ip
  if (typeof req.socket?.remoteAddress === "string" && req.socket.remoteAddress.trim()) {
    return req.socket.remoteAddress
  }
  return "-"
}

function formatPathWithQuery(req: Request): string {
  return req.originalUrl || req.url || req.path
}

function isSSERequest(req: Request): boolean {
  const url = formatPathWithQuery(req)
  if (url.includes("/mail/stream")) return true
  if (/\/query\/\d+\/stream(?:\?|$)/.test(url)) return true
  return false
}

export function createRequestLogger(args?: { debug?: boolean }) {
  const debug = isDebugEnabled(args?.debug)

  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = createRequestId()
    res.locals.requestId = requestId
    const start = Date.now()
    const path = formatPathWithQuery(req)
    const ip = formatIp(req)
    const sse = isSSERequest(req)

    if (sse) {
      logLine("info", `HTTP IN  ${req.method} ${path} rid=${requestId} ip=${ip}`)
      logDebugJson(debug, {
        event: "http.request.in",
        requestId,
        method: req.method,
        path,
        ip,
      })
    }

    res.on("finish", () => {
      const durationMs = Date.now() - start
      const line = `HTTP OUT ${req.method} ${path} ${res.statusCode} ${durationMs}ms rid=${requestId} ip=${ip}`
      logLine(res.statusCode >= 500 ? "error" : "info", line)
      logDebugJson(debug, {
        level: res.statusCode >= 500 ? "error" : "info",
        event: "http.request.out",
        requestId,
        method: req.method,
        path,
        status: res.statusCode,
        durationMs,
        ip,
        userAgent: req.header("user-agent") || "",
      })
    })

    next()
  }
}
