/**
 * Integration test configuration
 * Supports environment variables for running against real KSEF services
 */
import path from 'path'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: path.resolve(process.cwd(), '.env') })

export interface IntegrationTestEnvironmentConfig {
  mode: 'mock' | 'test' | 'production'
  baseURL?: string
  timeout: number
  retries: number
  mockPort?: number

  // Real service configuration
  realService?: {
    certificatePath?: string
    certificatePemPath?: string
    privateKeyPath?: string
    certificatePassword?: string
    testNip?: string
    skipCertificateValidation?: boolean
  }
}

/**
 * Get integration test configuration from environment variables
 */
export function getIntegrationTestConfig(): IntegrationTestEnvironmentConfig {
  const mode = (process.env['KSEF_TEST_MODE'] as 'mock' | 'test' | 'production') || 'mock'

  const config: IntegrationTestEnvironmentConfig = {
    mode,
    timeout: parseInt(process.env['KSEF_TEST_TIMEOUT'] || '30000'),
    retries: parseInt(process.env['KSEF_TEST_RETRIES'] || '3'),
  }

  // Add mockPort only if defined
  const mockPortStr = process.env['KSEF_MOCK_PORT']
  if (mockPortStr) {
    config.mockPort = parseInt(mockPortStr)
  }

  // Set base URL based on mode
  switch (mode) {
    case 'mock':
      // Will be set dynamically when mock server starts
      break
    case 'test':
      config.baseURL = process.env['KSEF_TEST_BASE_URL'] || 'https://ksef-test.mf.gov.pl/api'
      break
    case 'production':
      config.baseURL = process.env['KSEF_PROD_BASE_URL'] || 'https://ksef.mf.gov.pl/api'
      break
  }

  // Real service configuration (when not using mocks)
  if (mode !== 'mock') {
    const certPemPath = process.env['KSEF_CERT_PEM_PATH']
    const privateKeyPath = process.env['KSEF_KEY_PEM_PATH']
    const keyPassphrase = process.env['KSEF_KEY_PASSPHRASE']
    const testNip = process.env['KSEF_NIP']
    const skipValidation = process.env['KSEF_SKIP_CERT_VALIDATION'] === 'true'

    config.realService = {
      skipCertificateValidation: skipValidation,
    }

    if (certPemPath) config.realService.certificatePemPath = certPemPath
    if (privateKeyPath) config.realService.privateKeyPath = privateKeyPath
    if (keyPassphrase) config.realService.certificatePassword = keyPassphrase
    if (testNip) config.realService.testNip = testNip
  }

  return config
}

/**
 * Validate that required configuration is present for real service testing
 */
export function validateRealServiceConfig(config: IntegrationTestEnvironmentConfig): void {
  if (config.mode === 'mock') {
    return // No validation needed for mock mode
  }

  const missing: string[] = []

  if (!config.baseURL) {
    missing.push('KSEF_TEST_BASE_URL or KSEF_PROD_BASE_URL')
  }

  const hasPem = Boolean(config.realService?.certificatePemPath && config.realService?.privateKeyPath)

  if (!hasPem) {
    missing.push('KSEF_CERT_PEM_PATH and KSEF_KEY_PEM_PATH')
  }

  if (!config.realService?.testNip) {
    missing.push('KSEF_NIP')
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for real service testing: ${missing.join(', ')}\n` +
      `Set KSEF_TEST_MODE=mock to use mock server instead.`
    )
  }
}

/**
 * Print configuration info for debugging
 */
export function logTestConfig(config: IntegrationTestEnvironmentConfig): void {
  console.log(`🧪 Integration Test Configuration:`)
  console.log(`   Mode: ${config.mode}`)
  console.log(`   Base URL: ${config.baseURL || 'Will be set by mock server'}`)
  console.log(`   Timeout: ${config.timeout}ms`)
  console.log(`   Retries: ${config.retries}`)

  if (config.mode !== 'mock') {
    console.log(`   Certificate PEM: ${config.realService?.certificatePemPath ? '✅ Configured' : '❌ Missing'}`)
    console.log(`   Private Key PEM: ${config.realService?.privateKeyPath ? '✅ Configured' : '❌ Missing'}`)
    console.log(`   Test NIP: ${config.realService?.testNip ? '✅ Configured' : '❌ Missing'}`)
    console.log(`   Skip Cert Validation: ${config.realService?.skipCertificateValidation ? 'Yes' : 'No'}`)
  }

  if (config.mode === 'mock') {
    console.log(`   Mock Port: ${config.mockPort || 'Auto-assigned'}`)
  }

  console.log('')
}
