import type Database from "better-sqlite3"

export class AppCtx {
    db: Database.Database
    config: {
        exposeConfigRoutes: boolean
        apiKeySource: 'env' | 'keychain'
    }

    constructor() {

    }

}