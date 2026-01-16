import { describe, it, expect, beforeAll } from 'vitest'
import { BaseIntegrationTest, AuthenticatedSession, IntegrationTestConfig } from './base/BaseIntegrationTest'
import { SessionBuilder } from '@/index'
import { getIntegrationTestConfig, validateRealServiceConfig, logTestConfig } from './config'

/**
 * Real service integration tests for session management
 *
 * This test file demonstrates how to run integration tests against the real KSEF service
 * instead of mocks. To use this:
 *
 * 1. Set environment variables:
 *    export KSEF_TEST_MODE=test  # or 'production' for prod environment
 *    export KSEF_CERT_PEM_PATH=/path/to/your/certificate.pem
 *    export KSEF_KEY_PEM_PATH=/path/to/your/private-key.pem
 *    export KSEF_KEY_PASSPHRASE=your_key_passphrase
 *    export KSEF_NIP=your_test_nip
 *    export KSEF_SKIP_CERT_VALIDATION=true  # optional, for self-signed certs
 *
 * 2. Run the test:
 *    bun test tests/integration/SessionIntegration.realservice.test.ts
 *
 * Note: This will make real API calls to KSEF servers
 */
export class SessionRealServiceIntegrationTest extends BaseIntegrationTest {
  private testNip: string = ''
  private authSession?: AuthenticatedSession

  public setupTests(): void {
    this.setupHooks()

    const runRealService = process.env['KSEF_RUN_REAL_SERVICE_TESTS'] === 'true'
    const describeBlock = runRealService ? describe : describe.skip

    describeBlock('Session Management - Real Service Integration Tests', () => {
      beforeAll(async () => {
        this.testNip = this.envConfig?.realService?.testNip || this.generateRandomNip()
        this.authSession = await this.authWithCustomNip(this.testNip)
      })

      it('should create and manage real online session', async () => {
        await this.realOnlineSessionTest()
      })

      it('should list and verify real active sessions', async () => {
        await this.realActiveSessionsTest()
      })

      it('should handle real session lifecycle', async () => {
        await this.realSessionLifecycleTest()
      })
    })
  }

  /**
   * Test creating and managing a real online session
   */
  private async realOnlineSessionTest(): Promise<void> {
    console.log('🌐 Testing real online session creation...')

    if (!this.authSession) {
      throw new Error('Authentication session not available')
    }

    // Create a real online session
    const sessionConfig = SessionBuilder.onlineForNip(this.testNip)
      .withDescription('Real service test session')
      .withTimeout(1800)
      .build()

    console.log('Creating online session with config:', sessionConfig)
    const sessionResult = await this.client.sessionManager.createOnlineSession(sessionConfig)

    expect(sessionResult.sessionId).toBeDefined()
    expect(sessionResult.status).toBe('active')
    expect(sessionResult.sessionType).toBe('online')

    console.log(`✅ Created real session: ${sessionResult.sessionId}`)

    // Get session info
    const sessionInfo = await this.client.sessionManager.getSessionInfo(sessionResult.sessionId)
    expect(sessionInfo.sessionId).toBe(sessionResult.sessionId)
    expect([100, 150]).toContain(sessionInfo.status.code)

    console.log('✅ Verified session info')

    // Close the session
    const closeResult = await this.client.sessionManager.closeSession(sessionResult.sessionId, true)
    expect(closeResult.sessionId).toBe(sessionResult.sessionId)
    expect(['closed', 'closing'].includes(closeResult.status)).toBe(true)

    console.log('✅ Closed real session')
  }

  /**
   * Test listing real active sessions
   */
  private async realActiveSessionsTest(): Promise<void> {
    console.log('🌐 Testing real active sessions listing...')

    if (!this.authSession) {
      throw new Error('Authentication session not available')
    }

    // List active sessions
    const activeSessions = await this.client.sessionManager.listActiveSessions()
    expect(Array.isArray(activeSessions)).toBe(true)

    console.log(`✅ Retrieved ${activeSessions.length} active sessions`)

    // Each session should have required properties
    activeSessions.forEach((session, index) => {
      expect(session.sessionId).toBeDefined()
      expect(session.status).toBeDefined()
      expect(session.sessionType).toBeDefined()
      console.log(`   Session ${index + 1}: ${session.sessionId} (${session.status})`)
    })
  }

  /**
   * Test complete real session lifecycle
   */
  private async realSessionLifecycleTest(): Promise<void> {
    console.log('🌐 Testing real session lifecycle...')

    if (!this.authSession) {
      throw new Error('Authentication session not available')
    }

    // Step 1: Create session
    const sessionConfig = SessionBuilder.onlineForNip(this.testNip)
      .withDescription('Lifecycle test session')
      .withTimeout(3600)
      .build()

    const sessionResult = await this.client.sessionManager.createOnlineSession(sessionConfig)
    const sessionId = sessionResult.sessionId

    console.log(`📋 Created session: ${sessionId}`)

    // Step 2: Verify session is active
    const isActive = await this.client.sessionManager.isSessionActive(sessionId)
    expect(isActive).toBe(true)
    console.log('✅ Verified session is active')

    // Step 3: Refresh session information
    const refreshedSession = await this.client.sessionManager.refreshSession(sessionId)
    expect(refreshedSession.sessionId).toBe(sessionId)
    expect(refreshedSession.status).toBe('active')
    console.log('✅ Refreshed session information')

    // Step 4: Close session with UPO generation
    const closeResult = await this.client.sessionManager.closeSession(sessionId, true)
    expect(closeResult.sessionId).toBe(sessionId)
    expect(['closed', 'closing'].includes(closeResult.status)).toBe(true)

    if (closeResult.upoReferenceNumber) {
      console.log(`✅ Generated UPO: ${closeResult.upoReferenceNumber}`)
    }

    // Step 5: Verify session is no longer active
    const isActiveAfterClose = await this.client.sessionManager.isSessionActive(sessionId)
    expect(isActiveAfterClose).toBe(false)
    console.log('✅ Verified session is closed')
  }
}

// Export test setup function that uses environment configuration
export function setupRealServiceSessionIntegrationTests(): void {
  // Use manual configuration since createFromEnvironment is protected
  const envConfig = getIntegrationTestConfig()
  logTestConfig(envConfig)

  if (envConfig.mode !== 'mock') {
    validateRealServiceConfig(envConfig)
  }

  const config: Partial<IntegrationTestConfig> = {
    environment: envConfig.mode === 'production' ? 'production' : 'test',
    timeout: envConfig.timeout,
    retries: envConfig.retries,
    enableMocking: envConfig.mode === 'mock',
  }

  // Add optional properties only if defined
  if (envConfig.baseURL) {
    config.baseURL = envConfig.baseURL
  }
  if (envConfig.mockPort) {
    config.mockPort = envConfig.mockPort
  }

  const sessionTests = new SessionRealServiceIntegrationTest(config)

  // Set environment config manually
  ;(sessionTests as any).envConfig = envConfig
  sessionTests.setupTests()
}

// Auto-setup tests when this file is run directly with environment-based configuration
const testMode = process.env['KSEF_TEST_MODE']
if (testMode && testMode !== 'mock') {
  console.log('🌐 Setting up real service integration tests...')
  setupRealServiceSessionIntegrationTests()
} else {
  console.log('ℹ️  Skipping real service tests (KSEF_TEST_MODE not set or set to mock)')
  console.log('ℹ️  To run real service tests, set KSEF_TEST_MODE=test and configure certificate environment variables')

  // Add a minimal test suite to avoid "no test suite found" error
  describe('Real Service Tests (Skipped)', () => {
    it('should skip real service tests when KSEF_TEST_MODE is mock', () => {
      expect(testMode || 'mock').toBe('mock')
    })
  })
}
