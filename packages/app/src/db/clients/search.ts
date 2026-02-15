import type Database from "better-sqlite3";

export class SearchDBClient {
    db: Database.Database;

    constructor(db: Database.Database) {
        this.db = db;
    }

}
