import express from "express"
import configRoutes from "./routes/config.js"
import { initDB } from "../db/index.js"

function main() {
    initDB() // 🔥 runs before server starts

    const app = express()
    app.use(express.json())

    app.use("/api", configRoutes)
    app.use("/api", configRoutes)
    app.use("/api", configRoutes)

    app.listen(3000, () => {
        console.log("Server running on http://localhost:3000")
    })
}

main()