import fs from "node:fs"
import path from "node:path"
import { Router } from "express"
import { AppCtx } from "../../appCtx.js"

function extractTitle(markdown: string, fallback: string): string {
  const lines = markdown.split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)\s*$/)
    if (match?.[1]) return match[1].trim()
  }
  return fallback
}

function safeSlug(value: string): string | null {
  const slug = value.trim().toLowerCase()
  if (!slug) return null
  if (!/^[a-z0-9][a-z0-9-_]*$/.test(slug)) return null
  return slug
}

function readGuideOrder(docsPath: string): string[] {
  const manifestPath = path.join(docsPath, "index.json")
  if (!fs.existsSync(manifestPath)) return []

  try {
    const raw = fs.readFileSync(manifestPath, "utf8")
    const parsed = JSON.parse(raw) as { order?: unknown }
    if (!Array.isArray(parsed.order)) return []

    const seen = new Set<string>()
    const order: string[] = []
    for (const value of parsed.order) {
      if (typeof value !== "string") continue
      const slug = safeSlug(value)
      if (!slug || seen.has(slug)) continue
      seen.add(slug)
      order.push(slug)
    }
    return order
  } catch {
    return []
  }
}

export function createGuideRouter(appCtx: AppCtx) {
  const router = Router()
  const docsPath = appCtx.config.server.docsPath

  router.get("/index", (_req, res) => {
    if (!fs.existsSync(docsPath)) {
      res.json({ docs: [] })
      return
    }

    const files = fs
      .readdirSync(docsPath, { withFileTypes: true })
      .filter((item) => item.isFile() && item.name.toLowerCase().endsWith(".md"))
      .map((item) => item.name)
    const slugs = files.map((filename) => filename.replace(/\.md$/i, ""))
    const slugSet = new Set(slugs)
    const orderedSlugsFromManifest = readGuideOrder(docsPath).filter((slug) =>
      slugSet.has(slug)
    )
    const orderedSlugSet = new Set(orderedSlugsFromManifest)
    const fallbackSlugs = slugs
      .filter((slug) => !orderedSlugSet.has(slug))
      .sort((a, b) => a.localeCompare(b))
    const orderedSlugs = [...orderedSlugsFromManifest, ...fallbackSlugs]

    const docs = orderedSlugs.map((slug) => {
      const filename = `${slug}.md`
      const fullPath = path.join(docsPath, filename)
      const raw = fs.readFileSync(fullPath, "utf8")
      const title = extractTitle(raw, slug)
      return { slug, title, filename }
    })

    res.json({ docs })
  })

  router.get("/:slug", (req, res) => {
    const slug = safeSlug(req.params.slug || "")
    if (!slug) {
      res.status(400).json({ error: "invalid slug" })
      return
    }

    const fullPath = path.join(docsPath, `${slug}.md`)
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: "doc not found" })
      return
    }

    const markdown = fs.readFileSync(fullPath, "utf8")
    const title = extractTitle(markdown, slug)
    res.json({ slug, title, markdown })
  })

  return router
}
