import { beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { KsefClient, DefaultCertificateGenerator, CertificateGenerationOptions, CertificateFormat } from '@/index'
import { TestUtils } from './TestUtils'
import { MockServer } from './MockServer'
import { getIntegrationTestConfig, validateRealServiceConfig, logTestConfig, IntegrationTestEnvironmentConfig } from '../config'

export interface IntegrationTestConfig {
  baseURL: string
  environment: 'test' | 'production'
  timeout: number
  retries: number
  enableMocking: boolean
  mockPort?: number
}

export interface AuthenticatedSession {
  accessToken: string
  refreshToken: string
  sessionToken: string
  expiresAt: Date
  certificateInfo: any
}

export abstract class BaseIntegrationTest {
  protected client!: KsefClient
  protected testUtils: TestUtils
  protected mockServer?: MockServer
  protected config: IntegrationTestConfig
  protected envConfig?: IntegrationTestEnvironmentConfig
  private originalFetch?: typeof fetch
  private usingInProcessMock = false
  private currentAccessToken?: string
  private authInterceptorAdded = false

  constructor(config: Partial<IntegrationTestConfig> = {}) {
    this.config = {
      baseURL: 'https://ksef-test.mf.gov.pl/api',
      environment: 'test',
      timeout: 30000,
      retries: 3,
      enableMocking: false,
      ...config,
    }

    this.testUtils = new TestUtils()
  }

  /**
   * Create test instance using environment-based configuration
   */
  protected static createFromEnvironment<T extends BaseIntegrationTest>(
    this: new (config?: Partial<IntegrationTestConfig>) => T,
    overrides: Partial<IntegrationTestConfig> = {}
  ): T {
    const envConfig = getIntegrationTestConfig()

    // Log configuration for debugging
    logTestConfig(envConfig)

    // Validate configuration if using real service
    if (envConfig.mode !== 'mock') {
      validateRealServiceConfig(envConfig)
    }

    const config: Partial<IntegrationTestConfig> = {
      environment: envConfig.mode === 'production' ? 'production' : 'test',
      timeout: envConfig.timeout,
      retries: envConfig.retries,
      enableMocking: envConfig.mode === 'mock',
      ...overrides,
    }

    // Add optional properties only if defined
    if (envConfig.baseURL) {
      config.baseURL = envConfig.baseURL
    }
    if (envConfig.mockPort) {
      config.mockPort = envConfig.mockPort
    }

    const instance = new this(config)
    instance.envConfig = envConfig
    return instance
  }

  protected async setupIntegrationTest(): Promise<void> {
    // Setup mock server if enabled
    if (this.config.enableMocking) {
      this.mockServer = new MockServer()
      try {
        await this.mockServer.start(this.config.mockPort)
        this.config.baseURL = `http://localhost:${this.mockServer.port}`
      } catch (error) {
        if (this.isListenPermissionError(error)) {
          this.enableInProcessMock()
        } else {
          throw error
        }
      }
    }

    // Initialize KSEF client
    this.client = KsefClient.create({
      baseURL: this.config.baseURL,
      environment: this.config.environment,
      timeout: this.config.timeout,
      retries: this.config.retries,
    })
  }

  protected async teardownIntegrationTest(): Promise<void> {
    if (this.mockServer) {
      await this.mockServer.stop()
    }
    if (this.usingInProcessMock && this.originalFetch) {
      globalThis.fetch = this.originalFetch
      this.usingInProcessMock = false
    }
  }

  /**
   * Authenticate with a custom NIP (equivalent to Java's authWithCustomNip)
   */
  protected async authWithCustomNip(nip: string): Promise<AuthenticatedSession> {
    const effectiveNip = !this.config.enableMocking && this.envConfig?.realService?.testNip
      ? this.envConfig.realService.testNip
      : nip

    if (this.config.enableMocking) {
      // In mock mode, return a mock authentication session
      return {
        accessToken: `mock-access-token-${effectiveNip}`,
        refreshToken: `mock-refresh-token-${effectiveNip}`,
        sessionToken: `mock-session-token-${effectiveNip}`,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        certificateInfo: {
          subject: `CN=Test Certificate ${effectiveNip}, O=Test Organization, C=PL`,
          issuer: `CN=Test CA, O=Test Organization, C=PL`,
          serialNumber: `${Date.now()}`,
          notBefore: new Date(Date.now() - 86400000), // Yesterday
          notAfter: new Date(Date.now() + 365 * 86400000), // 1 year from now
          thumbprint: `mock-thumbprint-${effectiveNip}`,
          algorithm: 'SHA256withRSA',
        },
      }
    }

    let authConfig: any

    // Use real certificate if configured via environment
    if (this.envConfig?.realService?.certificatePath || this.envConfig?.realService?.certificatePemPath) {
      const fs = await import('fs')

      if (this.envConfig.realService.certificatePemPath && this.envConfig.realService.privateKeyPath) {
        console.log(`🔐 Using real PEM certificate from: ${this.envConfig.realService.certificatePemPath}`)

        const certPem = fs.readFileSync(this.envConfig.realService.certificatePemPath, 'utf-8')
        const keyPem = fs.readFileSync(this.envConfig.realService.privateKeyPath, 'utf-8')
        const combinedPem = `${certPem}\n${keyPem}`

        authConfig = {
          certificateData: new Uint8Array(Buffer.from(combinedPem, 'utf-8')),
          certificatePassword: this.envConfig.realService.certificatePassword,
          format: CertificateFormat.PEM,
          algorithm: 'SHA256withRSA' as const,
          validateCertificate: !this.envConfig.realService.skipCertificateValidation,
        }
      } else if (this.envConfig.realService.certificatePath) {
        console.log(`🔐 Using real certificate from: ${this.envConfig.realService.certificatePath}`)

        const certificateData = fs.readFileSync(this.envConfig.realService.certificatePath)
        const pemText = certificateData.toString('utf-8')
        const looksLikePem = pemText.includes('BEGIN')
        const hasCertificateBlock = pemText.includes('BEGIN CERTIFICATE')

        if (looksLikePem && !hasCertificateBlock) {
          throw new Error(
            'PEM file does not include a certificate. Provide KSEF_CERT_PEM_PATH for the certificate and KSEF_KEY_PEM_PATH for the key.'
          )
        }

        authConfig = {
          certificateData: new Uint8Array(certificateData),
          certificatePassword: this.envConfig.realService.certificatePassword,
          format: looksLikePem ? CertificateFormat.PEM : CertificateFormat.PKCS12,
          algorithm: 'SHA256withRSA' as const,
          validateCertificate: !this.envConfig.realService.skipCertificateValidation,
        }
      }
    } else {
      // Generate a test certificate for authentication
      console.log(`🧪 Generating test certificate for NIP: ${effectiveNip}`)

      const certificateOptions: CertificateGenerationOptions = {
        commonName: `Test Certificate for ${effectiveNip}`,
        organization: 'Test Organization',
        country: 'PL',
        validDays: 365,
        algorithm: 'RSA',
        keySize: 2048,
        password: 'test-password',
      }

      const generator = new DefaultCertificateGenerator()
      const generatedCert = await generator.generateSelfSignedCertificate(certificateOptions)

      authConfig = {
        certificateData: new Uint8Array(generatedCert.pkcs12Data),
        certificatePassword: 'test-password',
        format: CertificateFormat.PKCS12,
        algorithm: 'SHA256withRSA' as const,
        validateCertificate: false, // Skip validation for test certificates
      }
    }

    try {
      const authRequest = {
        ...authConfig,
        contextIdentifier: { type: 'nip', value: effectiveNip },
        subjectIdentifierType: 'certificateSubject',
        authMode: this.config.enableMocking ? 'legacy' : 'xades',
        verifyCertificateChain: !this.envConfig?.realService?.skipCertificateValidation,
        useMockSignature: this.config.enableMocking,
      }

      const maxAttempts = this.envConfig?.realService ? 6 : 1
      const delayMs = 3000
      let lastError: unknown

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const authResult = await this.client.authenticator.authenticate(authRequest)
          this.setAccessToken(authResult.accessToken)

          return {
            accessToken: authResult.accessToken,
            refreshToken: authResult.refreshToken,
            sessionToken: authResult.sessionToken,
            expiresAt: authResult.expiresAt,
            certificateInfo: authResult.certificateInfo,
          }
        } catch (error) {
          lastError = error
          const message = error instanceof Error ? error.message : String(error)
          if (message.includes('Uwierzytelnianie w toku') && attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, delayMs))
            continue
          }
          throw error
        }
      }

      throw lastError ?? new Error('Authentication failed')
    } catch (error) {
      throw new Error(`Authentication failed for NIP ${effectiveNip}: ${error}`)
    }
  }

  /**
   * Wait for asynchronous operation to complete (equivalent to Awaitility)
   */
  protected async waitForCondition<T>(
    condition: () => Promise<T>,
    options: {
      timeout?: number
      pollInterval?: number
      description?: string
    } = {}
  ): Promise<T> {
    const {
      timeout = 30000,
      pollInterval = 1000,
      description = 'condition to be met',
    } = options

    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      try {
        const result = await condition()
        if (result) {
          return result
        }
      } catch (error) {
        // Continue polling on errors unless timeout
        if (Date.now() - startTime >= timeout) {
          throw error
        }
      }

      await this.delay(pollInterval)
    }

    throw new Error(`Timeout waiting for ${description} after ${timeout}ms`)
  }

  /**
   * Wait for status to reach expected value
   */
  protected async waitForStatus(
    statusChecker: () => Promise<{ status: string; [key: string]: any }>,
    expectedStatus: string | string[],
    options: {
      timeout?: number
      pollInterval?: number
      description?: string
    } = {}
  ): Promise<any> {
    const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus]

    return this.waitForCondition(
      async () => {
        const result = await statusChecker()
        if (expectedStatuses.includes(result.status)) {
          return result
        }
        return null
      },
      {
        ...options,
        description: options.description || `status to be one of: ${expectedStatuses.join(', ')}`,
      }
    )
  }

  /**
   * Generate random test NIP or use configured NIP from environment
   */
  protected generateRandomNip(): string {
    // Use configured test NIP if available and not in mock mode
    if (!this.config.enableMocking && this.envConfig?.realService?.testNip) {
      console.log(`📋 Using configured test NIP: ${this.envConfig.realService.testNip}`)
      return this.envConfig.realService.testNip
    }

    // Generate random NIP for mock/testing
    const randomNip = this.testUtils.generateRandomNIP()
    console.log(`🎲 Generated random test NIP: ${randomNip}`)
    return randomNip
  }

  /**
   * Generate random EU VAT number
   */
  protected generateRandomVatEu(): string {
    return this.testUtils.generateRandomVatEu()
  }

  /**
   * Create test invoice data with placeholders replaced
   */
  protected createTestInvoiceData(options: {
    nip?: string
    invoiceNumber?: string
    template?: 'fa2' | 'fa3'
  } = {}): any {
    const {
      nip = this.generateRandomNip(),
      invoiceNumber = `INV-${Date.now()}`,
      template = 'fa2',
    } = options

    return this.testUtils.createInvoiceFromTemplate(template, nip, invoiceNumber)
  }

  /**
   * Delay helper
   */
  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Assert response status codes
   */
  protected assertStatusCode(actual: number, expected: number | number[]): void {
    const expectedCodes = Array.isArray(expected) ? expected : [expected]
    if (!expectedCodes.includes(actual)) {
      throw new Error(`Expected status code to be one of ${expectedCodes}, but got ${actual}`)
    }
  }

  /**
   * Assert operation success
   */
  protected assertOperationSuccess(response: any): void {
    if (!response || response.error) {
      throw new Error(`Operation failed: ${response?.error || 'Unknown error'}`)
    }
  }

  /**
   * Setup hooks for subclasses
   */
  protected setupHooks(): void {
    beforeAll(async () => {
      await this.setupIntegrationTest()
    })

    afterAll(async () => {
      await this.teardownIntegrationTest()
    })

    beforeEach(async () => {
      await this.beforeEachTest()
    })

    afterEach(async () => {
      await this.afterEachTest()
    })
  }

  protected async beforeEachTest(): Promise<void> {
    // Override in subclasses if needed
  }

  protected async afterEachTest(): Promise<void> {
    // Override in subclasses if needed
  }

  private setAccessToken(token: string): void {
    this.currentAccessToken = token
    if (this.authInterceptorAdded) {
      return
    }

    this.client.httpClient.addRequestInterceptor({
      onRequest: async config => {
        if (this.currentAccessToken) {
          config.headers = {
            ...config.headers,
            Authorization: `Bearer ${this.currentAccessToken}`,
          }
        }
        return config
      },
    })
    this.authInterceptorAdded = true
  }

  private enableInProcessMock(): void {
    if (!this.mockServer) {
      return
    }

    console.warn('Mock server listen blocked, using in-process mock fetch')
    this.originalFetch = globalThis.fetch
    globalThis.fetch = this.mockServer.createFetchHandler()
    this.usingInProcessMock = true
    this.config.baseURL = 'http://mock.local'
  }

  private isListenPermissionError(error: unknown): boolean {
    return typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: string }).code === 'EPERM'
  }
}
