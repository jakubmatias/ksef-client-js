import { describe, expect, it } from 'vitest'
import { buildAuthTokenRequestXml } from '@/auth/auth-token-request'

describe('buildAuthTokenRequestXml', () => {
  it('builds auth token request xml for NIP context', () => {
    const xml = buildAuthTokenRequestXml({
      challenge: 'challenge-123',
      contextIdentifier: { type: 'nip', value: '7431952631' },
      subjectIdentifierType: 'certificateSubject',
    })

    expect(xml).toContain('<Challenge>challenge-123</Challenge>')
    expect(xml).toContain('<Nip>7431952631</Nip>')
    expect(xml).toContain('<SubjectIdentifierType>certificateSubject</SubjectIdentifierType>')
  })

  it('throws a clear error when challenge is missing', () => {
    expect(() => buildAuthTokenRequestXml({
      challenge: undefined as unknown as string,
      contextIdentifier: { type: 'nip', value: '7431952631' },
      subjectIdentifierType: 'certificateSubject',
    })).toThrow('Missing required auth token field: challenge')
  })

  it('throws a clear error when context identifier value is missing', () => {
    expect(() => buildAuthTokenRequestXml({
      challenge: 'challenge-123',
      contextIdentifier: { type: 'nip', value: undefined as unknown as string },
      subjectIdentifierType: 'certificateSubject',
    })).toThrow('Missing required auth token field: contextIdentifier.value')
  })
})
