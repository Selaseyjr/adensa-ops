import type { D1Like } from '../../worker'

export function createD1(): D1Like & { raw: { exec(sql: string): void; prepare(sql: string): { all(...p: unknown[]): unknown[] } } }
