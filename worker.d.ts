// Types for worker.js so the TypeScript build and the Vitest worker tests
// can import the plain-JS worker without any suppressions.

export interface D1StatementLike {
  bind(...params: unknown[]): {
    first(): Promise<Record<string, unknown> | null>
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
  /** PBKDF2-SHA256 hash of the app-edition PIN (hex). Secrets only: sign-in answers 503 without it. */
  REAL_PIN_HASH?: string
  REAL_PIN_SALT?: string
  REAL_PIN_ITERATIONS?: string
  /** HMAC key for session tokens; derived from the PIN hash when unset. */
  SESSION_SECRET?: string
}

type PartialEnv = Partial<Pick<WorkerEnv, 'REAL_PIN_HASH' | 'REAL_PIN_SALT' | 'REAL_PIN_ITERATIONS' | 'SESSION_SECRET'>>

export function issueToken(env: PartialEnv, now?: number): Promise<{ token: string; expiresAt: number }>
export function verifyToken(env: PartialEnv, token: string | null, now?: number): Promise<boolean>

declare const worker: {
  fetch(request: Request, env: WorkerEnv): Promise<Response>
}

export default worker
