import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, "..")
const repoRoot = path.resolve(appRoot, "../..")

const sourceFrontendDist = path.join(repoRoot, "packages/frontend/dist")
const sourceDocsDir = path.join(repoRoot, "docs")

const runtimeRoot = path.join(appRoot, "runtime")
const targetPublicDir = path.join(runtimeRoot, "public")
const targetDocsDir = path.join(runtimeRoot, "docs")

fs.rmSync(runtimeRoot, { recursive: true, force: true })
fs.mkdirSync(runtimeRoot, { recursive: true })

if (!fs.existsSync(sourceFrontendDist)) {
  throw new Error(`Frontend dist not found: ${sourceFrontendDist}. Run frontend build first.`)
}
if (!fs.existsSync(sourceDocsDir)) {
  throw new Error(`Docs directory not found: ${sourceDocsDir}`)
}

fs.cpSync(sourceFrontendDist, targetPublicDir, { recursive: true })
fs.cpSync(sourceDocsDir, targetDocsDir, { recursive: true })

console.log(`Bundled runtime assets:`)
console.log(`- public: ${targetPublicDir}`)
console.log(`- docs:   ${targetDocsDir}`)
