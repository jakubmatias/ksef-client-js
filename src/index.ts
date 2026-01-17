// Main library exports

// Types
export * from './types/session'
export {
  AuthChallengeSchema,
  AuthenticationInitResponseSchema,
  AuthenticationOperationStatusResponseSchema,
  AuthenticationTokenRefreshResponseSchema,
  AuthenticationTokensResponseSchema,
  TokenInfoSchema,
  CertificateFormat,
} from './types/auth'
export type {
  AuthMode,
  AuthenticationInitResponse,
  AuthenticationOperationStatusResponse,
  AuthenticationTokenRefreshResponse,
  AuthenticationTokensResponse,
  AuthChallenge,
  TokenInfo,
  ContextIdentifier,
  ContextIdentifierType,
  SubjectIdentifierType,
  IpAddressPolicy,
} from './types/auth'
export * from './types/invoice'
export * from './types/http'
export * from './types/security'

// Authentication
export { DefaultCertificateManager } from './auth/certificate-manager'
export type { CertificateManager } from './auth/certificate-manager'
export { DefaultCertificateGenerator } from './auth/certificate-generator'
export type { CertificateGenerator, CertificateGenerationOptions, GeneratedCertificate } from './auth/certificate-generator'
export { DefaultAuthenticator } from './auth/authenticator'
export type { Authenticator } from './auth/authenticator'

// Session Management
export { DefaultSessionManager } from './session/session-manager'
export type { SessionManager } from './session/session-manager'

// Invoice Operations
export { DefaultInvoiceService } from './invoice/invoice-service'
export type { InvoiceService } from './invoice/invoice-service'
export {
  buildFa2XmlFromJson,
  buildFa3XmlFromJson,
  buildFa3XmlFromXsdJson,
} from './invoice/xml-builder'
export type { Fa2InvoiceInput, Fa3InvoiceInput, Fa3XsdInvoiceInput } from './invoice/xml-builder'
export { createEncryptionData, encryptInvoiceXml } from './crypto/ksef-crypto'

// HTTP Client
export { DefaultHttpClient } from './http/http-client'
export type { HttpClient } from './http/http-client'
export { TokenBucketRateLimiter, NoOpRateLimiter } from './http/rate-limiter'

// Builder Patterns
export { AuthConfigBuilder } from './builders/auth-builder'
export { OnlineSessionBuilder, BatchSessionBuilder, SessionBuilder } from './builders/session-builder'
export {
  EntityBuilder,
  InvoiceLineBuilder,
  InvoiceHeaderBuilder,
  InvoiceBuilder,
  SimpleInvoiceBuilder,
} from './builders/invoice-builder'
export { Fa3XsdInvoiceBuilder } from './builders/xsd-invoice-builder'

// Local imports for the main client
import { DefaultHttpClient } from './http/http-client'
import { DefaultAuthenticator } from './auth/authenticator'
import { DefaultSessionManager } from './session/session-manager'
import { DefaultInvoiceService } from './invoice/invoice-service'
import { getKsefBaseUrl, KsefEnvironment } from './config/environment'

// Main KSEF Client
export interface KsefClientConfig {
  baseURL: string
  environment?: KsefEnvironment
  timeout?: number
  retries?: number
  rateLimit?: number
}

export class KsefClient {
  public readonly httpClient: DefaultHttpClient
  public readonly authenticator: DefaultAuthenticator
  public readonly sessionManager: DefaultSessionManager
  public readonly invoiceService: DefaultInvoiceService

  constructor(config: KsefClientConfig) {
    this.httpClient = new DefaultHttpClient({
      baseURL: config.baseURL,
      timeout: config.timeout ?? 30000,
      retries: config.retries ?? 3,
      headers: {},
      retryDelay: 1000,
      rateLimit: config.rateLimit,
    })

    this.authenticator = new DefaultAuthenticator(this.httpClient)
    this.sessionManager = new DefaultSessionManager(this.httpClient)
    this.invoiceService = new DefaultInvoiceService(this.httpClient)
  }

  public static create(config: KsefClientConfig): KsefClient {
    return new KsefClient(config)
  }

  public static forEnvironment(environment: KsefEnvironment): KsefClient {
    const baseURL = getKsefBaseUrl(environment)
    return new KsefClient({ baseURL, environment })
  }
}
