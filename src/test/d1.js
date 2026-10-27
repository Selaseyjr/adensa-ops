// A D1-compatible database over Node's built-in SQLite, for worker tests:
// real SQL, real constraints, no workerd needed.
import { DatabaseSync } from 'node:sqlite'

export function createD1() {
  const db = new DatabaseSync(':memory:')
  return {
    raw: db,
    async exec(sql) {
      db.exec(sql)
      return { count: 1 }
    },
    prepare(sql) {
      const make = (params) => ({
        bind: (...next) => make(next),
        async first() {
          return db.prepare(sql).get(...params) ?? null
        },
        async all() {
          return { results: db.prepare(sql).all(...params) }
        },
        async run() {
          db.prepare(sql).run(...params)
          return { success: true }
        },
      })
      return make([])
    },
  }
}
