import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DefaultCertificateManager } from '@/auth/certificate-manager'
import { DefaultCertificateGenerator } from '@/auth/certificate-generator'
import { CertificateError, CertificateFormat } from '@/types/auth'

describe('DefaultCertificateManager', () => {
  let certificateManager: DefaultCertificateManager
  const dayMs = 24 * 60 * 60 * 1000

  const createTestPkcs12 = async (password: string): Promise<Uint8Array> => {
    const generator = new DefaultCertificateGenerator()
    const generated = await generator.generateSelfSignedCertificate({
      commonName: 'Test Certificate',
      organization: 'Test Org',
      country: 'PL',
      password,
    })
    return new Uint8Array(generated.pkcs12Data)
  }

  beforeEach(() => {
    certificateManager = new DefaultCertificateManager()
    vi.clearAllMocks()
  })

  describe('loadCertificate', () => {
    it('should load PKCS12 certificate with password', async () => {
      const password = 'test-password'
      const certData = await createTestPkcs12(password)

      const result = await certificateManager.loadCertificate(
        certData,
        password,
        CertificateFormat.PKCS12
      )

      expect(result).toBeDefined()
      expect(result.serialNumber.length).toBeGreaterThan(0)
      expect(result.algorithm).toBe('SHA256withRSA')
      expect(result.subject).toContain('CN=Test Certificate')
      expect(result.keyUsage).toContain('digitalSignature')
      expect(result.keyUsage).toContain('keyEncipherment')
      expect(typeof result.thumbprint).toBe('string')
    })

    it('should throw error for PKCS12 without password', async () => {
      const certData = new Uint8Array([1, 2, 3, 4, 5])

      await expect(
        certificateManager.loadCertificate(certData, undefined, CertificateFormat.PKCS12)
      ).rejects.toThrow(CertificateError)
    })

    it('should throw error for unsupported format', async () => {
      const certData = new Uint8Array([1, 2, 3, 4, 5])

      await expect(
        certificateManager.loadCertificate(certData, 'password', 'UNSUPPORTED' as CertificateFormat)
      ).rejects.toThrow(CertificateError)
    })

    it('should throw error for PEM format (not implemented)', async () => {
      const certData = new Uint8Array([1, 2, 3, 4, 5])

      await expect(
        certificateManager.loadCertificate(certData, undefined, CertificateFormat.PEM)
      ).rejects.toThrow(CertificateError)
    })
  })

  describe('validateCertificate', () => {
    it('should validate certificate with correct key usage', async () => {
      const now = Date.now()
      const validCert = {
        serialNumber: '123',
        issuer: 'CN=Test CA',
        subject: 'CN=Test',
        notBefore: new Date(now - dayMs),
        notAfter: new Date(now + dayMs),
        thumbprint: 'ABC123',
        algorithm: 'SHA256withRSA',
        keyUsage: ['digitalSignature', 'keyEncipherment'],
      }

      const result = await certificateManager.validateCertificate(validCert)
      expect(result).toBe(true)
    })

    it('should reject expired certificate', async () => {
      const now = Date.now()
      const expiredCert = {
        serialNumber: '123',
        issuer: 'CN=Test CA',
        subject: 'CN=Test',
        notBefore: new Date(now - 10 * dayMs),
        notAfter: new Date(now - dayMs),
        thumbprint: 'ABC123',
        algorithm: 'SHA256withRSA',
        keyUsage: ['digitalSignature'],
      }

      const result = await certificateManager.validateCertificate(expiredCert)
      expect(result).toBe(false)
    })

    it('should reject certificate without required key usage', async () => {
      const now = Date.now()
      const invalidCert = {
        serialNumber: '123',
        issuer: 'CN=Test CA',
        subject: 'CN=Test',
        notBefore: new Date(now - dayMs),
        notAfter: new Date(now + dayMs),
        thumbprint: 'ABC123',
        algorithm: 'SHA256withRSA',
        keyUsage: ['keyAgreement'], // Missing digitalSignature or keyEncipherment
      }

      const result = await certificateManager.validateCertificate(invalidCert)
      expect(result).toBe(false)
    })
  })

  describe('isExpired', () => {
    it('should detect expired certificate', () => {
      const now = Date.now()
      const expiredCert = {
        serialNumber: '123',
        issuer: 'CN=Test CA',
        subject: 'CN=Test',
        notBefore: new Date(now - 10 * dayMs),
        notAfter: new Date(now - dayMs),
        thumbprint: 'ABC123',
        algorithm: 'SHA256withRSA',
        keyUsage: ['digitalSignature'],
      }

      const result = certificateManager.isExpired(expiredCert)
      expect(result).toBe(true)
    })

    it('should detect not yet valid certificate', () => {
      const now = Date.now()
      const futureCert = {
        serialNumber: '123',
        issuer: 'CN=Test CA',
        subject: 'CN=Test',
        notBefore: new Date(now + dayMs),
        notAfter: new Date(now + 10 * dayMs),
        thumbprint: 'ABC123',
        algorithm: 'SHA256withRSA',
        keyUsage: ['digitalSignature'],
      }

      const result = certificateManager.isExpired(futureCert)
      expect(result).toBe(true)
    })

    it('should detect valid certificate', () => {
      const now = Date.now()
      const validCert = {
        serialNumber: '123',
        issuer: 'CN=Test CA',
        subject: 'CN=Test',
        notBefore: new Date(now - dayMs),
        notAfter: new Date(now + dayMs),
        thumbprint: 'ABC123',
        algorithm: 'SHA256withRSA',
        keyUsage: ['digitalSignature'],
      }

      const result = certificateManager.isExpired(validCert)
      expect(result).toBe(false)
    })
  })

  describe('isExpiringSoon', () => {
    it('should detect certificate expiring within default threshold', () => {
      const soonExpiring = new Date()
      soonExpiring.setDate(soonExpiring.getDate() + 15) // 15 days from now

      const cert = {
        serialNumber: '123',
        issuer: 'CN=Test CA',
        subject: 'CN=Test',
        notBefore: new Date('2023-01-01'),
        notAfter: soonExpiring,
        thumbprint: 'ABC123',
        algorithm: 'SHA256withRSA',
        keyUsage: ['digitalSignature'],
      }

      const result = certificateManager.isExpiringSoon(cert)
      expect(result).toBe(true)
    })

    it('should detect certificate expiring within custom threshold', () => {
      const soonExpiring = new Date()
      soonExpiring.setDate(soonExpiring.getDate() + 5) // 5 days from now

      const cert = {
        serialNumber: '123',
        issuer: 'CN=Test CA',
        subject: 'CN=Test',
        notBefore: new Date('2023-01-01'),
        notAfter: soonExpiring,
        thumbprint: 'ABC123',
        algorithm: 'SHA256withRSA',
        keyUsage: ['digitalSignature'],
      }

      const result = certificateManager.isExpiringSoon(cert, 7)
      expect(result).toBe(true)
    })

    it('should not detect certificate with plenty of time left', () => {
      const farExpiring = new Date()
      farExpiring.setDate(farExpiring.getDate() + 60) // 60 days from now

      const cert = {
        serialNumber: '123',
        issuer: 'CN=Test CA',
        subject: 'CN=Test',
        notBefore: new Date('2023-01-01'),
        notAfter: farExpiring,
        thumbprint: 'ABC123',
        algorithm: 'SHA256withRSA',
        keyUsage: ['digitalSignature'],
      }

      const result = certificateManager.isExpiringSoon(cert)
      expect(result).toBe(false)
    })
  })

  describe('signData', () => {
    it('should throw error when no private key is available', async () => {
      const data = new Uint8Array([1, 2, 3, 4])

      await expect(certificateManager.signData(data, 'SHA256withRSA')).rejects.toThrow(
        CertificateError
      )
    })

    it('should throw error for unsupported algorithm', async () => {
      // Load a certificate first to have a private key
      const password = 'password'
      const certData = await createTestPkcs12(password)
      await certificateManager.loadCertificate(certData, password, CertificateFormat.PKCS12)

      const data = new Uint8Array([1, 2, 3, 4])

      await expect(certificateManager.signData(data, 'UNSUPPORTED_ALGORITHM')).rejects.toThrow(
        CertificateError
      )
    })
  })

  describe('getCertificateThumbprint', () => {
    it('should return thumbprint after loading certificate', async () => {
      const password = 'password'
      const certData = await createTestPkcs12(password)
      await certificateManager.loadCertificate(certData, password, CertificateFormat.PKCS12)

      const thumbprint = certificateManager.getCertificateThumbprint()
      expect(typeof thumbprint).toBe('string')
      expect(thumbprint.length).toBeGreaterThan(0)
    })

    it('should throw error when no certificate is loaded', () => {
      expect(() => certificateManager.getCertificateThumbprint()).toThrow(CertificateError)
    })
  })

  describe('loadCertificateFromPath', () => {
    it('should throw not implemented error', async () => {
      await expect(
        certificateManager.loadCertificateFromPath('/path/to/cert.p12', 'password')
      ).rejects.toThrow(CertificateError)
    })
  })
})
