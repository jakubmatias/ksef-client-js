/**
 * Main integration test runner
 * Equivalent to Java's integration test suite structure
 *
 * This file sets up and runs all integration tests that mirror
 * the Java KSEF client integration test implementation
 */

// Import all integration test setup functions
import { setupAuthorizationIntegrationTests } from './AuthorizationIntegration.test'
import { setupSessionIntegrationTests } from './SessionIntegration.test'
import { setupCertificateIntegrationTests } from './CertificateIntegration.test'
import { setupBatchIntegrationTests } from './BatchIntegration.test'
import { setupOnlineSessionIntegrationTests } from './OnlineSessionIntegration.test'
import { setupQueryInvoiceIntegrationTests } from './QueryInvoiceIntegration.test'

// Import base test infrastructure
import { MockServer } from './base/MockServer'

import { describe, beforeAll, afterAll } from 'vitest'

describe('KSEF Client Integration Tests', () => {
  let mockServer: MockServer

  beforeAll(async () => {
    console.log('🚀 Starting KSEF Integration Test Suite')
    console.log('📋 Test coverage matches Java implementation:')
    console.log('  ✓ Authorization flows (RSA/ECDSA, token refresh)')
    console.log('  ✓ Session management (online/batch lifecycle)')
    console.log('  ✓ Certificate operations (enrollment, validation, revocation)')
    console.log('  ✓ Batch processing (file upload, streaming)')
    console.log('  ✓ Online invoice submission (E2E workflow)')
    console.log('  ✓ Invoice querying (search, retrieval, validation)')
    console.log('')

    // Start mock server if not already running
    if (process.env['ENABLE_INTEGRATION_MOCKING'] === 'true') {
      mockServer = new MockServer()
      await mockServer.start()
      console.log(`🎭 Mock server started on port ${mockServer.port}`)
    }
  })

  afterAll(async () => {
    // Cleanup mock server if running
    if (mockServer) {
      await mockServer.stop()
      console.log('🛑 Mock server stopped')
    }

    console.log('✅ KSEF Integration Test Suite completed')
  })

  // Set up all integration test suites
  setupAuthorizationIntegrationTests()
  setupSessionIntegrationTests()
  setupCertificateIntegrationTests()
  setupBatchIntegrationTests()
  setupOnlineSessionIntegrationTests()
  setupQueryInvoiceIntegrationTests()
})

export {
  // Test classes for direct usage if needed
  AuthorizationIntegrationTest,
} from './AuthorizationIntegration.test'
export { SessionIntegrationTest } from './SessionIntegration.test'
export { CertificateIntegrationTest } from './CertificateIntegration.test'
export { BatchIntegrationTest } from './BatchIntegration.test'
export { OnlineSessionIntegrationTest } from './OnlineSessionIntegration.test'
export { QueryInvoiceIntegrationTest } from './QueryInvoiceIntegration.test'

export {
  // Base infrastructure
  BaseIntegrationTest,
} from './base/BaseIntegrationTest'
export { MockServer } from './base/MockServer'

// Export named test setup functions for selective testing
export {
  setupAuthorizationIntegrationTests,
  setupSessionIntegrationTests,
  setupCertificateIntegrationTests,
  setupBatchIntegrationTests,
  setupOnlineSessionIntegrationTests,
  setupQueryInvoiceIntegrationTests,
}