import type Database from "better-sqlite3"

type Migration = {
    name: string
    sql: string
}

export const migrations: Migration[] = [
    {
        name: "001_init",
        sql: `

        `,
    },
]