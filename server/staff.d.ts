export type Role = 'product_lead' | 'operations_manager' | 'secretary'
export const ROLES: Role[]
export const PASSWORD_ITERATIONS: number
export const MIN_PASSWORD_LENGTH: number
export const SESSION_TTL_MS: number
export const STAFF_SCHEMA: string
export function hashPassword(password: string, iterations?: number): Promise<string>
export function verifyPassword(password: string, stored: string): Promise<boolean>
export function normaliseEmail(email: unknown): string
export function safeEqual(a: unknown, b: unknown): boolean
export function issueStaffToken(
  env: { SESSION_SECRET?: string },
  staff: { id: string; token_version: number },
  now?: number,
): Promise<{ token: string; expiresAt: number }>
export function readStaffToken(
  env: { SESSION_SECRET?: string },
  token: string | null,
  now?: number,
): Promise<{ sub: string; ver: number; exp: number } | null>
