import { describe, it, expect, beforeEach } from 'vitest'
import { DefaultCertificateGenerator, CertificateGenerationOptions } from '@/auth/certificate-generator'
import { CertificateError } from '@/types/auth'

describe('DefaultCertificateGenerator', () => {
  let certificateGenerator: DefaultCertificateGenerator

  beforeEach(() => {
    certificateGenerator = new DefaultCertificateGenerator()
  })

  describe('generateSelfSignedCertificate', () => {
    it('should generate RSA self-signed certificate with basic options', async () => {
      const options: CertificateGenerationOptions = {
        commonName: 'Test Certificate',
        validDays: 365,
        keySize: 2048,
        algorithm: 'RSA',
      }

      const result = await certificateGenerator.generateSelfSignedCertificate(options)

      expect(result).toBeDefined()
      expect(result.certificate).toBeDefined()
      expect(result.privateKey).toBeDefined()
      expect(result.publicKey).toBeDefined()
      expect(result.pkcs12Data).toBeDefined()
      expect(result.pemCertificate).toBeDefined()
      expect(result.pemPrivateKey).toBeDefined()

      // Check certificate properties
      expect(result.certificate.subject).toContain('CN=Test Certificate')
      expect(result.certificate.issuer).toBe(result.certificate.subject) // Self-signed
      expect(result.certificate.serialNumber).toMatch(/^[0-9A-Fa-f]+$/)
      expect(result.certificate.algorithm).toBe('SHA256withRSA')
      expect(result.certificate.keyUsage).toContain('digitalSignature')
      expect(result.certificate.keyUsage).toContain('keyEncipherment')
      expect(result.certificate.thumbprint).toMatch(/^[0-9A-F]+$/)
    })

    it('should generate ECDSA self-signed certificate', async () => {
      const options: CertificateGenerationOptions = {
        commonName: 'Test ECDSA Certificate',
        validDays: 180,
        algorithm: 'ECDSA',
      }

      const result = await certificateGenerator.generateSelfSignedCertificate(options)

      expect(result.certificate.algorithm).toBe('SHA256withECDSA')
      expect(result.certificate.subject).toContain('CN=Test ECDSA Certificate')
    })

    it('should generate certificate with full subject information', async () => {
      const options: CertificateGenerationOptions = {
        commonName: 'Full Test Certificate',
        organization: 'Test Organization',
        organizationalUnit: 'Test Unit',
        locality: 'Test City',
        state: 'Test State',
        country: 'PL',
        emailAddress: 'test@example.com',
        validDays: 730,
        keySize: 4096,
        algorithm: 'RSA',
      }

      const result = await certificateGenerator.generateSelfSignedCertificate(options)

      expect(result.certificate.subject).toContain('CN=Full Test Certificate')
      expect(result.certificate.subject).toContain('O=Test Organization')
      expect(result.certificate.subject).toContain('OU=Test Unit')
      expect(result.certificate.subject).toContain('L=Test City')
      expect(result.certificate.subject).toContain('ST=Test State')
      expect(result.certificate.subject).toContain('C=PL')
      expect(result.certificate.subject).toContain('emailAddress=test@example.com')
    })

    it('should set correct validity period', async () => {
      const validDays = 90
      const options: CertificateGenerationOptions = {
        commonName: 'Test Validity',
        validDays,
      }

      const result = await certificateGenerator.generateSelfSignedCertificate(options)

      const notBefore = result.certificate.notBefore
      const notAfter = result.certificate.notAfter
      const expectedNotAfter = new Date(notBefore.getTime() + validDays * 24 * 60 * 60 * 1000)

      expect(notAfter.getTime()).toBeCloseTo(expectedNotAfter.getTime(), -10000) // Within 10 seconds
      expect(notAfter > notBefore).toBe(true)
    })

    it('should use default values when not specified', async () => {
      const options: CertificateGenerationOptions = {
        commonName: 'Default Test',
      }

      const result = await certificateGenerator.generateSelfSignedCertificate(options)

      // Check defaults
      expect(result.certificate.algorithm).toBe('SHA256withRSA')

      // Check validity period (default 365 days)
      const validityPeriod = result.certificate.notAfter.getTime() - result.certificate.notBefore.getTime()
      const expectedPeriod = 365 * 24 * 60 * 60 * 1000
      expect(validityPeriod).toBeCloseTo(expectedPeriod, -10000)
    })

    it('should generate unique serial numbers', async () => {
      const options: CertificateGenerationOptions = {
        commonName: 'Serial Test',
      }

      const cert1 = await certificateGenerator.generateSelfSignedCertificate(options)
      const cert2 = await certificateGenerator.generateSelfSignedCertificate(options)

      expect(cert1.certificate.serialNumber).not.toBe(cert2.certificate.serialNumber)
    })

    it('should generate unique thumbprints', async () => {
      const options: CertificateGenerationOptions = {
        commonName: 'Thumbprint Test',
      }

      const cert1 = await certificateGenerator.generateSelfSignedCertificate(options)
      const cert2 = await certificateGenerator.generateSelfSignedCertificate(options)

      expect(cert1.certificate.thumbprint).not.toBe(cert2.certificate.thumbprint)
    })

    it('should throw error when commonName is missing', async () => {
      const options: CertificateGenerationOptions = {
        commonName: '',
      }

      await expect(certificateGenerator.generateSelfSignedCertificate(options))
        .rejects.toThrow(CertificateError)
    })

    it('should generate valid PEM format', async () => {
      const options: CertificateGenerationOptions = {
        commonName: 'PEM Test',
      }

      const result = await certificateGenerator.generateSelfSignedCertificate(options)

      expect(result.pemCertificate).toMatch(/^-----BEGIN CERTIFICATE-----/)
      expect(result.pemCertificate).toMatch(/-----END CERTIFICATE-----\n$/)
      expect(result.pemPrivateKey).toMatch(/^-----BEGIN PRIVATE KEY-----/)
      expect(result.pemPrivateKey).toMatch(/-----END PRIVATE KEY-----\n$/)
    })

    it('should generate PKCS#12 data', async () => {
      const password = 'test-password'
      const options: CertificateGenerationOptions = {
        commonName: 'PKCS12 Test',
        password,
      }

      const result = await certificateGenerator.generateSelfSignedCertificate(options)

      expect(result.pkcs12Data).toBeInstanceOf(ArrayBuffer)
      expect(result.pkcs12Data.byteLength).toBeGreaterThan(0)
    })

    it('should handle password in generation options', async () => {
      const password = 'secure-password-123'
      const options: CertificateGenerationOptions = {
        commonName: 'Password Test',
        password,
      }

      const result = await certificateGenerator.generateSelfSignedCertificate(options)

      expect(result).toBeDefined()
      expect(result.pkcs12Data.byteLength).toBeGreaterThan(0)
    })
  })

  describe('exportToPKCS12', () => {
    it('should export certificate to PKCS#12 format', async () => {
      const options: CertificateGenerationOptions = {
        commonName: 'Export Test',
      }

      const certificate = await certificateGenerator.generateSelfSignedCertificate(options)
      const password = 'export-password'

      const pkcs12Data = await certificateGenerator.exportToPKCS12(certificate, password)

      expect(pkcs12Data).toBeInstanceOf(ArrayBuffer)
      expect(pkcs12Data.byteLength).toBeGreaterThan(0)
    })
  })

  describe('exportToPEM', () => {
    it('should export certificate to PEM format', async () => {
      const options: CertificateGenerationOptions = {
        commonName: 'PEM Export Test',
      }

      const certificate = await certificateGenerator.generateSelfSignedCertificate(options)

      const pemData = await certificateGenerator.exportToPEM(certificate)

      expect(pemData.certificate).toMatch(/^-----BEGIN CERTIFICATE-----/)
      expect(pemData.certificate).toMatch(/-----END CERTIFICATE-----\n$/)
      expect(pemData.privateKey).toMatch(/^-----BEGIN PRIVATE KEY-----/)
      expect(pemData.privateKey).toMatch(/-----END PRIVATE KEY-----\n$/)
    })
  })

  describe('key generation', () => {
    it('should generate different key pairs for each certificate', async () => {
      const options: CertificateGenerationOptions = {
        commonName: 'Key Test',
      }

      const cert1 = await certificateGenerator.generateSelfSignedCertificate(options)
      const cert2 = await certificateGenerator.generateSelfSignedCertificate(options)

      // Export keys to compare
      const key1Exported = await crypto.subtle.exportKey('spki', cert1.publicKey)
      const key2Exported = await crypto.subtle.exportKey('spki', cert2.publicKey)

      expect(new Uint8Array(key1Exported)).not.toEqual(new Uint8Array(key2Exported))
    })

    it('should generate extractable private keys', async () => {
      const options: CertificateGenerationOptions = {
        commonName: 'Extractable Test',
      }

      const result = await certificateGenerator.generateSelfSignedCertificate(options)

      // Should be able to export the private key
      await expect(crypto.subtle.exportKey('pkcs8', result.privateKey))
        .resolves.toBeInstanceOf(ArrayBuffer)
    })
  })

  describe('certificate validation', () => {
    it('should set appropriate key usage', async () => {
      const options: CertificateGenerationOptions = {
        commonName: 'Key Usage Test',
      }

      const result = await certificateGenerator.generateSelfSignedCertificate(options)

      expect(result.certificate.keyUsage).toContain('digitalSignature')
      expect(result.certificate.keyUsage).toContain('keyEncipherment')
      expect(result.certificate.keyUsage).toContain('dataEncipherment')
      expect(result.certificate.keyUsage).toContain('keyAgreement')
    })

    it('should have self-signed issuer and subject match', async () => {
      const options: CertificateGenerationOptions = {
        commonName: 'Self-Signed Test',
        organization: 'Test Org',
      }

      const result = await certificateGenerator.generateSelfSignedCertificate(options)

      expect(result.certificate.issuer).toBe(result.certificate.subject)
      expect(result.certificate.issuer).toContain('CN=Self-Signed Test')
      expect(result.certificate.issuer).toContain('O=Test Org')
    })
  })

  describe('error handling', () => {
    it('should handle missing common name', async () => {
      const options: CertificateGenerationOptions = {
        commonName: '',
      }

      await expect(certificateGenerator.generateSelfSignedCertificate(options))
        .rejects.toThrow(CertificateError)

      await expect(certificateGenerator.generateSelfSignedCertificate(options))
        .rejects.toThrow('Common Name (CN) is required')
    })

    it('should wrap crypto errors in CertificateError', async () => {
      const options: CertificateGenerationOptions = {
        commonName: 'Error Test',
        keySize: -1, // Invalid key size should cause crypto error
      }

      await expect(certificateGenerator.generateSelfSignedCertificate(options))
        .rejects.toThrow(CertificateError)
    })
  })

  describe('format validation', () => {
    it('should generate valid certificate data structure', async () => {
      const options: CertificateGenerationOptions = {
        commonName: 'Structure Test',
      }

      const result = await certificateGenerator.generateSelfSignedCertificate(options)

      // Verify all required fields are present
      expect(result.certificate.serialNumber).toBeDefined()
      expect(result.certificate.issuer).toBeDefined()
      expect(result.certificate.subject).toBeDefined()
      expect(result.certificate.notBefore).toBeInstanceOf(Date)
      expect(result.certificate.notAfter).toBeInstanceOf(Date)
      expect(result.certificate.thumbprint).toBeDefined()
      expect(result.certificate.algorithm).toBeDefined()
      expect(result.certificate.keyUsage).toBeInstanceOf(Array)

      // Verify crypto keys
      expect(result.privateKey).toBeInstanceOf(CryptoKey)
      expect(result.publicKey).toBeInstanceOf(CryptoKey)
      expect(result.privateKey.type).toBe('private')
      expect(result.publicKey.type).toBe('public')
    })
  })
})