import { z } from 'zod'

// Status info schema (used across KSEF API responses per OpenAPI spec)
export const StatusInfoSchema = z.object({
  code: z.number(), // Status code (200, 400, etc.)
  description: z.string(), // Human readable description
  details: z.array(z.string()).optional(), // Optional additional details
})

export type StatusInfo = z.infer<typeof StatusInfoSchema>

// Session types
export enum SessionType {
  ONLINE = 'online',
  BATCH = 'batch',
}

// Session status enum
export enum SessionStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
}

// Form code schema (invoice schema metadata)
export const FormCodeSchema = z.object({
  systemCode: z.string().min(1),
  schemaVersion: z.string().min(1),
  value: z.string().min(1),
})

export type FormCode = z.infer<typeof FormCodeSchema>

// Encryption info schema for session creation
export const EncryptionInfoSchema = z.object({
  encryptedSymmetricKey: z.string().min(1),
  initializationVector: z.string().min(1),
})

export type EncryptionInfo = z.infer<typeof EncryptionInfoSchema>

// Online session configuration schema
export const OnlineSessionConfigSchema = z.object({
  nip: z.string().regex(/^\d{10}$/, 'NIP must be 10 digits'),
  description: z.string().optional(),
  timeout: z.number().min(1).max(3600).optional().default(1800), // 30 minutes default
  formCode: FormCodeSchema.optional(),
  encryption: EncryptionInfoSchema.optional(),
})

export type OnlineSessionConfig = z.infer<typeof OnlineSessionConfigSchema>

// Batch session configuration schema
export const BatchSessionConfigSchema = z.object({
  nip: z.string().regex(/^\d{10}$/, 'NIP must be 10 digits'),
  description: z.string().optional(),
  timeout: z.number().min(1).max(7200).optional().default(3600), // 1 hour default
  maxParts: z.number().min(1).max(100).optional().default(10),
  formCode: FormCodeSchema.optional(),
  encryption: EncryptionInfoSchema.optional(),
})

export type BatchSessionConfig = z.infer<typeof BatchSessionConfigSchema>

// Open online session request schema (per OpenAPI)
export const OpenOnlineSessionRequestSchema = z.object({
  formCode: FormCodeSchema,
  encryption: EncryptionInfoSchema,
})

export type OpenOnlineSessionRequest = z.infer<typeof OpenOnlineSessionRequestSchema>

// Session creation request schema
export const SessionCreateRequestSchema = z.object({
  sessionType: z.nativeEnum(SessionType),
  config: z.union([OnlineSessionConfigSchema, BatchSessionConfigSchema]),
})

export type SessionCreateRequest = z.infer<typeof SessionCreateRequestSchema>

// Session info schema (per OpenAPI SessionStatusResponse)
export const SessionInfoSchema = z.object({
  status: StatusInfoSchema, // Required status object
  validUntil: z.string().datetime().nullable(), // Can be null
  upo: z.unknown().nullable(), // UPO response object, null until session closed
  invoiceCount: z.number().nullable(), // Can be null
  successfulInvoiceCount: z.number().nullable(), // Can be null
  failedInvoiceCount: z.number().nullable(), // Can be null

  // Legacy fields for backward compatibility
  sessionId: z.string().optional(),
  sessionType: z.nativeEnum(SessionType).optional(),
  nip: z.string().optional(),
  description: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  timeout: z.number().optional(),
})

export type SessionInfo = z.infer<typeof SessionInfoSchema>

// Session create response schema (per OpenAPI spec)
export const SessionCreateResponseSchema = z.object({
  referenceNumber: z.string(), // Primary identifier per OpenAPI spec
  validUntil: z.string().datetime(), // OpenAPI spec uses validUntil instead of expiresAt

  // Legacy fields for backward compatibility
  sessionId: z.string().optional(),
  sessionType: z.nativeEnum(SessionType).optional(),
  status: z.nativeEnum(SessionStatus).optional(),
  expiresAt: z.string().datetime().optional(),
  timeout: z.number().optional(),
})

export type SessionCreateResponse = z.infer<typeof SessionCreateResponseSchema>

// Session close request schema
export const SessionCloseRequestSchema = z.object({
  sessionId: z.string(),
  generateUpo: z.boolean().optional().default(true),
})

export type SessionCloseRequest = z.infer<typeof SessionCloseRequestSchema>

// Session close response schema
export const SessionCloseResponseSchema = z.object({
  sessionId: z.string(),
  status: z.nativeEnum(SessionStatus),
  closedAt: z.string().datetime(),
  invoiceCount: z.number(),
  upoReferenceNumber: z.string().optional(),
})

export type SessionCloseResponse = z.infer<typeof SessionCloseResponseSchema>

// Session UPO (official confirmation) schema
export const SessionUpoSchema = z.object({
  sessionId: z.string(),
  referenceNumber: z.string(),
  upoData: z.string(), // Base64 encoded UPO document
  timestamp: z.string().datetime(),
})

export type SessionUpo = z.infer<typeof SessionUpoSchema>

// Session error class
export class SessionError extends Error {
  public readonly code: string
  public readonly sessionId?: string | undefined
  public readonly details?: unknown | undefined

  constructor(message: string, code: string, sessionId?: string | undefined, details?: unknown) {
    super(message)
    this.name = 'SessionError'
    this.code = code
    this.sessionId = sessionId
    this.details = details
  }
}

// Session timeout error
export class SessionTimeoutError extends SessionError {
  constructor(sessionId: string) {
    super(`Session ${sessionId} has timed out`, 'SESSION_TIMEOUT', sessionId)
    this.name = 'SessionTimeoutError'
  }
}

// Session state interface
export interface SessionState {
  sessionId: string
  sessionType: SessionType
  status: SessionStatus
  config: OnlineSessionConfig | BatchSessionConfig
  createdAt: Date
  expiresAt: Date
  lastActivity: Date
  invoiceCount: number
}
