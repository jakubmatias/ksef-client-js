import { z } from 'zod'

// Certificate formats supported
export enum CertificateFormat {
  PKCS12 = 'pkcs12',
  PEM = 'pem',
  DER = 'der',
}

export type SubjectIdentifierType = 'certificateSubject' | 'certificateFingerprint'
export type ContextIdentifierType = 'nip' | 'internalId' | 'nipVatEu'

export interface ContextIdentifier {
  type: ContextIdentifierType
  value: string
}

export type IpAddressPolicy = {
  onClientIpChange: 'ignore' | 'reject'
  allowedIps?: {
    ipAddress?: string[] | undefined
    ipRange?: string[] | undefined
    ipMask?: string[] | undefined
  } | undefined
}

export type AuthMode = 'xades' | 'legacy'

// Authentication challenge schema
export const AuthChallengeSchema = z.object({
  challenge: z.string(),
  timestamp: z.string(),
})

export type AuthChallenge = z.infer<typeof AuthChallengeSchema>

export const TokenInfoSchema = z.object({
  token: z.string(),
  validUntil: z.string(),
})

export type TokenInfo = z.infer<typeof TokenInfoSchema>

export const AuthenticationInitResponseSchema = z.object({
  referenceNumber: z.string(),
  authenticationToken: TokenInfoSchema,
})

export type AuthenticationInitResponse = z.infer<typeof AuthenticationInitResponseSchema>

export const StatusInfoSchema = z.object({
  code: z.number(),
  description: z.string(),
  details: z.array(z.string()).optional(),
})

export type StatusInfo = z.infer<typeof StatusInfoSchema>

export const AuthenticationOperationStatusResponseSchema = z.object({
  startDate: z.string(),
  authenticationMethod: z.string(),
  status: StatusInfoSchema,
  isTokenRedeemed: z.boolean().optional(),
  lastTokenRefreshDate: z.string().optional(),
  refreshTokenValidUntil: z.string().optional(),
})

export type AuthenticationOperationStatusResponse = z.infer<typeof AuthenticationOperationStatusResponseSchema>

export const AuthenticationTokensResponseSchema = z.object({
  accessToken: TokenInfoSchema,
  refreshToken: TokenInfoSchema,
})

export type AuthenticationTokensResponse = z.infer<typeof AuthenticationTokensResponseSchema>

export const AuthenticationTokenRefreshResponseSchema = z.object({
  accessToken: TokenInfoSchema,
})

export type AuthenticationTokenRefreshResponse = z.infer<typeof AuthenticationTokenRefreshResponseSchema>

// Authentication status schema
export const AuthStatusSchema = z.object({
  referenceNumber: z.string(),
  processingCode: z.number(),
  processingDescription: z.string(),
  timestamp: z.string(),
  upo: z.string().optional(),
})

export type AuthStatus = z.infer<typeof AuthStatusSchema>

// Access token response schema
export const AccessTokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  tokenType: z.enum(['Bearer']),
})

export type AccessTokenResponse = z.infer<typeof AccessTokenResponseSchema>

// Certificate info schema
export const CertificateInfoSchema = z.object({
  serialNumber: z.string(),
  issuer: z.string(),
  subject: z.string(),
  notBefore: z.date(),
  notAfter: z.date(),
  thumbprint: z.string(),
  algorithm: z.string(),
  keyUsage: z.array(z.string()),
})

export type CertificateInfo = z.infer<typeof CertificateInfoSchema>

// Authentication configuration schema
export const AuthConfigSchema = z.object({
  certificatePath: z.string().optional(),
  certificatePassword: z.string().optional(),
  certificateData: z.instanceof(Uint8Array).optional(),
  format: z.nativeEnum(CertificateFormat).default(CertificateFormat.PKCS12),
  algorithm: z.enum(['SHA256withRSA', 'SHA256withECDSA']).default('SHA256withRSA'),
  validateCertificate: z.boolean().default(true),
  authMode: z.enum(['xades', 'legacy']).default('xades'),
  subjectIdentifierType: z.enum(['certificateSubject', 'certificateFingerprint']).default('certificateSubject'),
  contextIdentifier: z.object({
    type: z.enum(['nip', 'internalId', 'nipVatEu']),
    value: z.string().min(1),
  }).optional(),
  ipAddressPolicy: z.object({
    onClientIpChange: z.enum(['ignore', 'reject']),
    allowedIps: z.object({
      ipAddress: z.array(z.string()).optional(),
      ipRange: z.array(z.string()).optional(),
      ipMask: z.array(z.string()).optional(),
    }).optional(),
  }).optional(),
  verifyCertificateChain: z.boolean().default(false),
  useMockSignature: z.boolean().default(false),
})

export type AuthConfig = z.infer<typeof AuthConfigSchema>

// Authentication error types
export class AuthenticationError extends Error {
  public readonly code: string
  public readonly details?: unknown

  constructor(message: string, code: string, details?: unknown) {
    super(message)
    this.name = 'AuthenticationError'
    this.code = code
    this.details = details
  }
}

export class CertificateError extends Error {
  public readonly code: string
  public readonly details?: unknown

  constructor(message: string, code: string, details?: unknown) {
    super(message)
    this.name = 'CertificateError'
    this.code = code
    this.details = details
  }
}

// Authentication result
export interface AuthResult {
  accessToken: string
  refreshToken: string
  expiresIn: number
  expiresAt: Date
  sessionToken: string
  referenceNumber?: string
  certificateInfo: CertificateInfo
}
