import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, "..")
const runtimeRoot = path.join(appRoot, "runtime")

const requiredPaths = [
  "public/index.html",
  "public/logo.png",
  "docs/index.json",
  "docs/getting-started.md",
]

const missing = requiredPaths.filter((relativePath) => !fs.existsSync(path.join(runtimeRoot, relativePath)))

if (missing.length > 0) {
  console.error("Runtime verification failed. Missing assets:")
  for (const item of missing) {
    console.error(`- runtime/${item}`)
  }
  process.exit(1)
}

console.log("Runtime verification passed.")
