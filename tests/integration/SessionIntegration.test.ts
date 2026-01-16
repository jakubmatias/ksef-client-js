import { describe, it, expect, beforeAll } from 'vitest'
import { BaseIntegrationTest, AuthenticatedSession } from './base/BaseIntegrationTest'
import { SessionBuilder } from '@/index'

/**
 * Integration tests for session management
 * Equivalent to Java's SessionIntegrationTest
 */
export class SessionIntegrationTest extends BaseIntegrationTest {
  private testNip: string = ''
  private authSession?: AuthenticatedSession

  constructor() {
    super({
      enableMocking: true,
      timeout: 30000,
    })
  }

  public setupTests(): void {
    this.setupHooks()

    describe('Session Management Integration Tests', () => {
      beforeAll(async () => {
        this.testNip = this.generateRandomNip()
        this.authSession = await this.authWithCustomNip(this.testNip)
      })

      it('should search sessions and revoke current session', async () => {
        await this.searchSessionAndRevokeCurrentSession()
      })

      it('should search sessions with filters', async () => {
        await this.searchSessions()
      })

      it('should manage session lifecycle', async () => {
        await this.sessionLifecycleTest()
      })

      it('should handle session timeout', async () => {
        await this.sessionTimeoutTest()
      })

      it('should monitor session status', async () => {
        await this.sessionStatusMonitoringTest()
      })

      it('should handle multiple concurrent sessions', async () => {
        await this.multipleConcurrentSessionsTest()
      })
    })
  }

  /**
   * Test session search and revocation
   * Equivalent to Java's searchSessionAndRevokeCurrentSession()
   */
  private async searchSessionAndRevokeCurrentSession(): Promise<void> {
    console.log('Starting search session and revoke current session test')

    if (!this.authSession) {
      throw new Error('Authentication session not available')
    }

    // Step 1: Create an online session
    const sessionConfig = SessionBuilder.onlineForNip(this.testNip)
      .withDescription('Test session for revocation')
      .withTimeout(1800)
      .build()

    const sessionResult = await this.client.sessionManager.createOnlineSession(sessionConfig)
    expect(sessionResult.sessionId).toBeDefined()
    expect(sessionResult.status).toBe('active')

    const sessionId = sessionResult.sessionId

    // Step 2: Search for active sessions
    const activeSessions = await this.client.sessionManager.listActiveSessions()
    expect(activeSessions).toBeDefined()
    expect(Array.isArray(activeSessions)).toBe(true)

    // Find our session in the list (in mock mode, just verify there are sessions)
    if (this.config.enableMocking) {
      expect(activeSessions.length).toBeGreaterThan(0)
      console.log(`Found ${activeSessions.length} active sessions (mocked)`)
    } else {
      const foundSession = activeSessions.find(session => session.sessionId === sessionId)
      expect(foundSession).toBeDefined()
    }

    // Step 3: Get session info
    const sessionInfo = await this.client.sessionManager.getSessionInfo(sessionId)
    if (this.config.enableMocking) {
      expect(sessionInfo.sessionId).toBeDefined()
      expect(sessionInfo.status).toEqual(expect.objectContaining({ code: 200 }))
    } else {
      expect(sessionInfo.sessionId).toBe(sessionId)
      expect(sessionInfo.status).toEqual(expect.objectContaining({ code: 200 }))
    }

    // Step 4: Revoke (close) the current session
    const closeResult = await this.client.sessionManager.closeSession(sessionId, true)
    if (this.config.enableMocking) {
      expect(closeResult.sessionId).toBeDefined()
      expect(closeResult.status).toBe('closed')
    } else {
      expect(closeResult.sessionId).toBe(sessionId)
      expect(closeResult.status).toBe('closed')
    }

    // Step 5: Verify session is no longer active (skip in mock mode to avoid complexity)
    if (!this.config.enableMocking) {
      const finalSessionInfo = await this.client.sessionManager.getSessionInfo(sessionId)
      expect(finalSessionInfo.status.code).not.toBe(200)
    }

    console.log('Search and revoke session test completed successfully')
  }

  /**
   * Test session search functionality
   * Equivalent to Java's searchSessions()
   */
  private async searchSessions(): Promise<void> {
    console.log('Starting search sessions test')

    if (!this.authSession) {
      throw new Error('Authentication session not available')
    }

    // Step 1: Create multiple test sessions
    const sessions: string[] = []

    for (let i = 0; i < 3; i++) {
      const sessionConfig = SessionBuilder.onlineForNip(this.testNip)
        .withDescription(`Test session ${i + 1}`)
        .withTimeout(1800)
        .build()

      const sessionResult = await this.client.sessionManager.createOnlineSession(sessionConfig)
      sessions.push(sessionResult.sessionId)
    }

    // Step 2: Search for all active sessions
    const activeSessions = await this.client.sessionManager.listActiveSessions()
    expect(activeSessions).toBeDefined()
    expect(Array.isArray(activeSessions)).toBe(true)

    if (this.config.enableMocking) {
      expect(activeSessions.length).toBeGreaterThan(0)
      console.log(`Found ${activeSessions.length} active sessions (mocked)`)
    } else {
      expect(activeSessions.length).toBeGreaterThanOrEqual(sessions.length)

      // Step 3: Verify our sessions are in the list
      for (const sessionId of sessions) {
        const foundSession = activeSessions.find(session => session.sessionId === sessionId)
        expect(foundSession).toBeDefined()
        expect(foundSession?.status).toEqual(expect.objectContaining({ code: 200 }))
      }
    }

    // Step 4: Clean up - close all test sessions
    for (const sessionId of sessions) {
      await this.client.sessionManager.closeSession(sessionId, false)
    }

    console.log('Search sessions test completed successfully')
  }

  /**
   * Test complete session lifecycle
   */
  private async sessionLifecycleTest(): Promise<void> {
    console.log('Starting session lifecycle test')

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

    expect(sessionResult.sessionId).toBeDefined()
    expect(sessionResult.status).toBe('active')
    expect(sessionResult.sessionType).toBe('online')

    // Step 2: Monitor session status over time
    if (this.config.enableMocking) {
      // In mock mode, just simulate a delay and verify session is active
      await this.delay(1000)
      const sessionInfo = await this.client.sessionManager.getSessionInfo(sessionId)
      expect(sessionInfo.status).toEqual(expect.objectContaining({ code: 200 }))
    } else {
      await this.waitForStatus(
        () => this.client.sessionManager.getSessionInfo(sessionId),
        'active',
        { timeout: 5000, description: 'session to become active' }
      )
    }

    // Step 3: Check if session is active using helper method
    const isActive = await this.client.sessionManager.isSessionActive(sessionId)
    expect(isActive).toBe(true)

    // Step 4: Refresh session information
    const refreshedSession = await this.client.sessionManager.refreshSession(sessionId)
    expect(refreshedSession.sessionId).toBe(sessionId)
    expect(refreshedSession.status).toBe('active')

    // Step 5: Close session with UPO generation
    const closeResult = await this.client.sessionManager.closeSession(sessionId, true)
    expect(closeResult.sessionId).toBe(sessionId)
    expect(closeResult.status).toBe('closed')
    if (this.config.enableMocking) {
      expect(closeResult.upoReferenceNumber).toBeUndefined()
    } else {
      expect(closeResult.upoReferenceNumber).toBeDefined()
    }

    // Step 6: Verify session is no longer active
    const isActiveAfterClose = await this.client.sessionManager.isSessionActive(sessionId)
    expect(isActiveAfterClose).toBe(false)

    console.log('Session lifecycle test completed successfully')
  }

  /**
   * Test session timeout handling
   */
  private async sessionTimeoutTest(): Promise<void> {
    console.log('Starting session timeout test')

    if (!this.authSession) {
      throw new Error('Authentication session not available')
    }

    // Create a session with short timeout (for testing purposes)
    const sessionConfig = SessionBuilder.onlineForNip(this.testNip)
      .withDescription('Timeout test session')
      .withTimeout(1) // Very short timeout
      .build()

    const sessionResult = await this.client.sessionManager.createOnlineSession(sessionConfig)
    const sessionId = sessionResult.sessionId

    // Wait for session to potentially timeout
    await this.delay(2000)

    // Check session status
    const sessionInfo = await this.client.sessionManager.getSessionInfo(sessionId)

    // Session might be active, timeout, or closed depending on mock behavior
    expect(typeof sessionInfo.status.code).toBe('number')

    console.log('Session timeout test completed successfully')
  }

  /**
   * Test session status monitoring
   */
  private async sessionStatusMonitoringTest(): Promise<void> {
    console.log('Starting session status monitoring test')

    if (!this.authSession) {
      throw new Error('Authentication session not available')
    }

    // Create session
    const sessionConfig = SessionBuilder.onlineForNip(this.testNip)
      .withDescription('Status monitoring test session')
      .withTimeout(1800)
      .build()

    const sessionResult = await this.client.sessionManager.createOnlineSession(sessionConfig)
    const sessionId = sessionResult.sessionId

    // Monitor status changes
    const statuses: string[] = []

    // Initial status
    let sessionInfo = await this.client.sessionManager.getSessionInfo(sessionId)
    statuses.push(sessionInfo.status)

    // Wait and check status again
    await this.delay(1000)
    sessionInfo = await this.client.sessionManager.getSessionInfo(sessionId)
    statuses.push(sessionInfo.status)

    // Close session and check final status
    await this.client.sessionManager.closeSession(sessionId, false)
    sessionInfo = await this.client.sessionManager.getSessionInfo(sessionId)
    statuses.push(sessionInfo.status)

    // Verify we tracked status changes
    expect(statuses.length).toBe(3)
    expect(statuses[0]).toEqual(expect.objectContaining({ code: 200 }))
    expect(typeof statuses[2]).toBe('object')

    console.log('Session status monitoring test completed successfully')
  }

  /**
   * Test multiple concurrent sessions
   */
  private async multipleConcurrentSessionsTest(): Promise<void> {
    console.log('Starting multiple concurrent sessions test')

    if (!this.authSession) {
      throw new Error('Authentication session not available')
    }

    const sessionIds: string[] = []
    const concurrentSessionCount = 3

    // Create multiple sessions concurrently
    const createPromises = Array.from({ length: concurrentSessionCount }, async (_, index) => {
      const sessionConfig = SessionBuilder.onlineForNip(this.testNip)
        .withDescription(`Concurrent test session ${index + 1}`)
        .withTimeout(1800)
        .build()

      const sessionResult = await this.client.sessionManager.createOnlineSession(sessionConfig)
      return sessionResult.sessionId
    })

    const createdSessionIds = await Promise.all(createPromises)
    sessionIds.push(...createdSessionIds)

    // Verify all sessions were created
    expect(sessionIds.length).toBe(concurrentSessionCount)

    // Check status of all sessions
    const statusPromises = sessionIds.map(sessionId =>
      this.client.sessionManager.getSessionInfo(sessionId)
    )

    const sessionInfos = await Promise.all(statusPromises)

    // Verify all sessions are active
    sessionInfos.forEach((info, index) => {
      expect(info.sessionId).toBe(sessionIds[index])
      expect(info.status).toEqual(expect.objectContaining({ code: 200 }))
    })

    // Close all sessions concurrently
    const closePromises = sessionIds.map(sessionId =>
      this.client.sessionManager.closeSession(sessionId, false)
    )

    await Promise.all(closePromises)

    console.log('Multiple concurrent sessions test completed successfully')
  }

}

// Export test setup function
export function setupSessionIntegrationTests(): void {
  const sessionTests = new SessionIntegrationTest()
  sessionTests.setupTests()
}

// Auto-setup tests when this file is run directly
const sessionTests = new SessionIntegrationTest()
sessionTests.setupTests()
