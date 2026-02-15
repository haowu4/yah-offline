import { migrations } from "../src/db/migration.js";
async function openInMemoryDB() {
    try {
        const { default: BetterSqlite3 } = await import("better-sqlite3");
        const db = new BetterSqlite3(":memory:");
        db.pragma("foreign_keys = ON");
        return {
            kind: "better-sqlite3",
            exec: (sql) => db.exec(sql),
            getTableNames: () => db
                .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
                .all()
                .map((row) => row.name),
            close: () => db.close(),
        };
    }
    catch {
        const { DatabaseSync } = await import("node:sqlite");
        const db = new DatabaseSync(":memory:");
        db.exec("PRAGMA foreign_keys = ON");
        return {
            kind: "node:sqlite",
            exec: (sql) => db.exec(sql),
            getTableNames: () => db
                .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
                .all()
                .map((row) => row.name),
            close: () => db.close(),
        };
    }
}
async function main() {
    const db = await openInMemoryDB();
    try {
        for (const migration of migrations) {
            db.exec(migration.sql);
        }
        const tables = db.getTableNames();
        console.log(`Migration smoke test passed (${db.kind}).`);
        console.log("Tables:", tables.join(", "));
    }
    finally {
        db.close();
    }
}
main();
