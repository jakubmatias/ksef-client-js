import { describe, expect, it } from 'vitest'
import { formatAuthCliError } from '@/cli/auth-error-format'
import { AuthenticationError } from '@/types/auth'

describe('formatAuthCliError', () => {
  it('renders structured authentication details from KSeF responses', () => {
    const error = new AuthenticationError('Token request failed', 'TOKEN_REQUEST_FAILED', {
      status: 400,
      statusText: 'Bad Request',
      url: 'https://api-test.ksef.mf.gov.pl/api/v2/auth/xades-signature',
      response: {
        exception: {
          exceptionDetailList: [
            { code: 'AUTH-001', description: 'Certificate subject is not authorized' },
          ],
        },
      },
      exceptionDetails: {
        exceptionDetailList: [
          { code: 'AUTH-001', description: 'Certificate subject is not authorized' },
        ],
      },
    })

    const formatted = formatAuthCliError(error)

    expect(formatted).toContain('Token request failed')
    expect(formatted).toContain('Code: TOKEN_REQUEST_FAILED')
    expect(formatted).toContain('HTTP: 400 Bad Request')
    expect(formatted).toContain('URL: https://api-test.ksef.mf.gov.pl/api/v2/auth/xades-signature')
    expect(formatted).toContain('KSeF detail: {"code":"AUTH-001","description":"Certificate subject is not authorized"}')
    expect(formatted).toContain('Hint: set KSEF_DEBUG_AUTH=1')
  })

  it('renders plain certificate errors cleanly', () => {
    const error = new AuthenticationError('Authentication failed', 'AUTH_FAILED', 'Password required for PKCS12 certificate')

    const formatted = formatAuthCliError(error)

    expect(formatted).toContain('Authentication failed')
    expect(formatted).toContain('Code: AUTH_FAILED')
    expect(formatted).toContain('Details: Password required for PKCS12 certificate')
  })

  it('renders raw invalid challenge responses', () => {
    const error = new AuthenticationError('Failed to get authentication challenge', 'CHALLENGE_FAILED', {
      code: 'INVALID_CHALLENGE_RESPONSE',
      details: {
        validation: {
          formErrors: ['Invalid input: expected object, received string'],
          fieldErrors: {},
        },
        rawResponse: '<html>upstream error</html>',
        status: 200,
        statusText: 'OK',
        url: 'https://api-test.ksef.mf.gov.pl/api/v2/auth/challenge',
      },
    })

    const formatted = formatAuthCliError(error)

    expect(formatted).toContain('Failed to get authentication challenge')
    expect(formatted).toContain('Code: CHALLENGE_FAILED')
    expect(formatted).toContain('Validation: {"formErrors":["Invalid input: expected object, received string"],"fieldErrors":{}}')
    expect(formatted).toContain('Raw response: "<html>upstream error</html>"')
  })
})
