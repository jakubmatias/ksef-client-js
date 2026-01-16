import { describe, it, expect } from 'vitest'
import { AuthConfigBuilder } from '@/builders/auth-builder'
import { CertificateFormat } from '@/types/auth'

describe('AuthConfigBuilder', () => {
  describe('builder pattern', () => {
    it('should build valid auth config with certificate path', () => {
      const config = AuthConfigBuilder.create()
        .withCertificatePath('/path/to/cert.p12')
        .withCertificatePassword('password')
        .withFormat(CertificateFormat.PKCS12)
        .withAlgorithm('SHA256withRSA')
        .withCertificateValidation(true)
        .build()

      expect(config).toEqual({
        certificatePath: '/path/to/cert.p12',
        certificatePassword: 'password',
        format: CertificateFormat.PKCS12,
        algorithm: 'SHA256withRSA',
        validateCertificate: true,
        authMode: 'xades',
        subjectIdentifierType: 'certificateSubject',
        verifyCertificateChain: false,
        useMockSignature: false,
      })
    })

    it('should build valid auth config with certificate data', () => {
      const certData = new Uint8Array([1, 2, 3, 4, 5])
      const config = AuthConfigBuilder.create()
        .withCertificateData(certData)
        .withCertificatePassword('password')
        .withFormat(CertificateFormat.PKCS12)
        .build()

      expect(config).toEqual({
        certificateData: certData,
        certificatePassword: 'password',
        format: CertificateFormat.PKCS12,
        algorithm: 'SHA256withRSA', // default
        validateCertificate: true, // default
        authMode: 'xades',
        subjectIdentifierType: 'certificateSubject',
        verifyCertificateChain: false,
        useMockSignature: false,
      })
    })

    it('should apply default values', () => {
      const config = AuthConfigBuilder.create()
        .withCertificatePath('/path/to/cert.p12')
        .withCertificatePassword('password')
        .build()

      expect(config.format).toBe(CertificateFormat.PKCS12)
      expect(config.algorithm).toBe('SHA256withRSA')
      expect(config.validateCertificate).toBe(true)
      expect(config.authMode).toBe('xades')
      expect(config.subjectIdentifierType).toBe('certificateSubject')
      expect(config.verifyCertificateChain).toBe(false)
      expect(config.useMockSignature).toBe(false)
    })

    it('should support method chaining', () => {
      const builder = AuthConfigBuilder.create()
      const result1 = builder.withCertificatePath('/path/to/cert.p12')
      const result2 = result1.withCertificatePassword('password')
      const result3 = result2.withFormat(CertificateFormat.PEM)

      expect(result1).toBe(builder)
      expect(result2).toBe(builder)
      expect(result3).toBe(builder)
    })

    it('should override previous values when called multiple times', () => {
      const config = AuthConfigBuilder.create()
        .withCertificatePath('/old/path.p12')
        .withCertificatePath('/new/path.p12')
        .withAlgorithm('SHA256withRSA')
        .withAlgorithm('SHA256withECDSA')
        .withCertificatePassword('password')
        .build()

      expect(config.certificatePath).toBe('/new/path.p12')
      expect(config.algorithm).toBe('SHA256withECDSA')
    })
  })

  describe('validation', () => {
    it('should throw error when no certificate path or data is provided', () => {
      const builder = AuthConfigBuilder.create().withCertificatePassword('password')

      expect(() => builder.build()).toThrow('Either certificatePath or certificateData must be provided')
    })

    it('should throw error for invalid algorithm', () => {
      const builder = AuthConfigBuilder.create()
        .withCertificatePath('/path/to/cert.p12')
        .withAlgorithm('INVALID_ALGORITHM' as any)

      expect(() => builder.build()).toThrow('Invalid authentication configuration')
    })

    it('should throw error for invalid format', () => {
      const builder = AuthConfigBuilder.create()
        .withCertificatePath('/path/to/cert.p12')
        .withFormat('INVALID_FORMAT' as any)

      expect(() => builder.build()).toThrow('Invalid authentication configuration')
    })

    it('should accept both certificate path and data (data takes precedence)', () => {
      const certData = new Uint8Array([1, 2, 3, 4, 5])
      const config = AuthConfigBuilder.create()
        .withCertificatePath('/path/to/cert.p12')
        .withCertificateData(certData)
        .withCertificatePassword('password')
        .build()

      expect(config.certificatePath).toBe('/path/to/cert.p12')
      expect(config.certificateData).toEqual(certData)
    })
  })

  describe('static factory method', () => {
    it('should create new builder instance', () => {
      const builder1 = AuthConfigBuilder.create()
      const builder2 = AuthConfigBuilder.create()

      expect(builder1).toBeInstanceOf(AuthConfigBuilder)
      expect(builder2).toBeInstanceOf(AuthConfigBuilder)
      expect(builder1).not.toBe(builder2)
    })
  })

  describe('certificate validation flag', () => {
    it('should set validation to false', () => {
      const config = AuthConfigBuilder.create()
        .withCertificatePath('/path/to/cert.p12')
        .withCertificatePassword('password')
        .withCertificateValidation(false)
        .build()

      expect(config.validateCertificate).toBe(false)
    })

    it('should set validation to true explicitly', () => {
      const config = AuthConfigBuilder.create()
        .withCertificatePath('/path/to/cert.p12')
        .withCertificatePassword('password')
        .withCertificateValidation(true)
        .build()

      expect(config.validateCertificate).toBe(true)
    })
  })

  describe('algorithm selection', () => {
    it('should support SHA256withRSA algorithm', () => {
      const config = AuthConfigBuilder.create()
        .withCertificatePath('/path/to/cert.p12')
        .withAlgorithm('SHA256withRSA')
        .withCertificatePassword('password')
        .build()

      expect(config.algorithm).toBe('SHA256withRSA')
    })

    it('should support SHA256withECDSA algorithm', () => {
      const config = AuthConfigBuilder.create()
        .withCertificatePath('/path/to/cert.p12')
        .withAlgorithm('SHA256withECDSA')
        .withCertificatePassword('password')
        .build()

      expect(config.algorithm).toBe('SHA256withECDSA')
    })
  })

  describe('certificate formats', () => {
    it('should support PKCS12 format', () => {
      const config = AuthConfigBuilder.create()
        .withCertificatePath('/path/to/cert.p12')
        .withFormat(CertificateFormat.PKCS12)
        .withCertificatePassword('password')
        .build()

      expect(config.format).toBe(CertificateFormat.PKCS12)
    })

    it('should support PEM format', () => {
      const config = AuthConfigBuilder.create()
        .withCertificatePath('/path/to/cert.pem')
        .withFormat(CertificateFormat.PEM)
        .withCertificatePassword('password')
        .build()

      expect(config.format).toBe(CertificateFormat.PEM)
    })

    it('should support DER format', () => {
      const config = AuthConfigBuilder.create()
        .withCertificatePath('/path/to/cert.der')
        .withFormat(CertificateFormat.DER)
        .withCertificatePassword('password')
        .build()

      expect(config.format).toBe(CertificateFormat.DER)
    })
  })
})
