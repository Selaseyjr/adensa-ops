// Types for worker.js so the TypeScript build and the Vitest worker tests
// can import the plain-JS worker without any suppressions.

export interface D1StatementLike {
  bind(...params: unknown[]): {
    first(): Promise<Record<string, unknown> | null>
    all(): Promise<{ results: Record<string, unknown>[] }>
    run(): Promise<{ success: boolean }>
  }
}

export interface D1Like {
  exec(sql: string): Promise<unknown>
  prepare(sql: string): D1StatementLike
}

export interface WorkerEnv {
  DB: D1Like
  ASSETS: { fetch(request: Request): Promise<Response> }
  /** HMAC key for staff sessions (at least 32 characters). Sign-in answers 503 without it. */
  SESSION_SECRET?: string
}

declare const worker: {
  fetch(request: Request, env: Partial<WorkerEnv> & Record<string, unknown>): Promise<Response>
}

export default worker
