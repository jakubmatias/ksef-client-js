import { CertificateInfo, CertificateError } from '@/types/auth'

export interface CertificateGenerationOptions {
  commonName: string
  organization?: string | undefined
  organizationalUnit?: string | undefined
  locality?: string | undefined
  state?: string | undefined
  country?: string | undefined
  emailAddress?: string | undefined
  validDays?: number | undefined
  keySize?: number | undefined
  algorithm?: 'RSA' | 'ECDSA' | undefined
  password?: string | undefined
}

export interface GeneratedCertificate {
  certificate: CertificateInfo
  privateKey: CryptoKey
  publicKey: CryptoKey
  pkcs12Data: ArrayBuffer
  pemCertificate: string
  pemPrivateKey: string
}

export interface CertificateGenerator {
  generateSelfSignedCertificate(options: CertificateGenerationOptions): Promise<GeneratedCertificate>
  exportToPKCS12(certificate: GeneratedCertificate, password: string): Promise<ArrayBuffer>
  exportToPEM(certificate: GeneratedCertificate): Promise<{ certificate: string; privateKey: string }>
}

export class DefaultCertificateGenerator implements CertificateGenerator {
  public async generateSelfSignedCertificate(
    options: CertificateGenerationOptions
  ): Promise<GeneratedCertificate> {
    try {
      // Validate required options
      if (!options.commonName) {
        throw new CertificateError('Common Name (CN) is required', 'INVALID_OPTIONS')
      }

      // Generate key pair
      const keyPair = await this.generateKeyPair(
        options.algorithm ?? 'RSA',
        options.keySize ?? 2048
      )

      // Create certificate info
      const notBefore = new Date()
      const notAfter = new Date()
      notAfter.setDate(notBefore.getDate() + (options.validDays ?? 365))

      const subject = this.buildSubject(options)
      const certificateInfo: CertificateInfo = {
        serialNumber: this.generateSerialNumber(),
        issuer: subject, // Self-signed, so issuer = subject
        subject,
        notBefore,
        notAfter,
        thumbprint: await this.generateThumbprint(keyPair.publicKey),
        algorithm: options.algorithm === 'ECDSA' ? 'SHA256withECDSA' : 'SHA256withRSA',
        keyUsage: [
          'digitalSignature',
          'keyEncipherment',
          'dataEncipherment',
          'keyAgreement',
        ],
      }

      // Generate certificate data
      const pemCertificate = await this.generatePEMCertificate(certificateInfo, keyPair)
      const pemPrivateKey = await this.exportPrivateKeyToPEM(keyPair.privateKey)
      const pkcs12Data = await this.generatePKCS12(
        certificateInfo,
        keyPair,
        options.password ?? ''
      )

      return {
        certificate: certificateInfo,
        privateKey: keyPair.privateKey,
        publicKey: keyPair.publicKey,
        pkcs12Data,
        pemCertificate,
        pemPrivateKey,
      }
    } catch (error) {
      if (error instanceof CertificateError) {
        throw error
      }
      throw new CertificateError(
        'Failed to generate certificate',
        'GENERATION_FAILED',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  public async exportToPKCS12(
    certificate: GeneratedCertificate,
    password: string
  ): Promise<ArrayBuffer> {
    return this.generatePKCS12(certificate.certificate, {
      privateKey: certificate.privateKey,
      publicKey: certificate.publicKey,
    }, password)
  }

  public async exportToPEM(
    certificate: GeneratedCertificate
  ): Promise<{ certificate: string; privateKey: string }> {
    return {
      certificate: certificate.pemCertificate,
      privateKey: certificate.pemPrivateKey,
    }
  }

  private async generateKeyPair(algorithm: 'RSA' | 'ECDSA', keySize: number): Promise<CryptoKeyPair> {
    try {
      if (algorithm === 'RSA') {
        return await crypto.subtle.generateKey(
          {
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength: keySize,
            publicExponent: new Uint8Array([1, 0, 1]), // 65537
            hash: 'SHA-256',
          },
          true, // extractable
          ['sign', 'verify']
        )
      } else {
        // ECDSA
        return await crypto.subtle.generateKey(
          {
            name: 'ECDSA',
            namedCurve: 'P-256',
          },
          true, // extractable
          ['sign', 'verify']
        )
      }
    } catch (error) {
      throw new CertificateError(
        'Failed to generate key pair',
        'KEY_GENERATION_FAILED',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private buildSubject(options: CertificateGenerationOptions): string {
    const parts: string[] = []

    if (options.commonName) parts.push(`CN=${options.commonName}`)
    if (options.organization) parts.push(`O=${options.organization}`)
    if (options.organizationalUnit) parts.push(`OU=${options.organizationalUnit}`)
    if (options.locality) parts.push(`L=${options.locality}`)
    if (options.state) parts.push(`ST=${options.state}`)
    if (options.country) parts.push(`C=${options.country}`)
    if (options.emailAddress) parts.push(`emailAddress=${options.emailAddress}`)

    return parts.join(', ')
  }

  private generateSerialNumber(): string {
    // Generate a random serial number (in production, this should be more sophisticated)
    const array = new Uint8Array(16)
    crypto.getRandomValues(array)
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
  }

  private async generateThumbprint(publicKey: CryptoKey): Promise<string> {
    try {
      // Export the public key and hash it to create thumbprint
      const exportedKey = await crypto.subtle.exportKey('spki', publicKey)
      const hashBuffer = await crypto.subtle.digest('SHA-1', exportedKey)
      const hashArray = new Uint8Array(hashBuffer)
      return Array.from(hashArray, byte => byte.toString(16).padStart(2, '0').toUpperCase()).join('')
    } catch (error) {
      throw new CertificateError(
        'Failed to generate thumbprint',
        'THUMBPRINT_FAILED',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private async generatePEMCertificate(
    certificateInfo: CertificateInfo,
    keyPair: CryptoKeyPair
  ): Promise<string> {
    // This is a simplified PEM generation
    // In a real implementation, you would generate proper ASN.1/DER encoded certificate
    const certData = {
      version: 3,
      serialNumber: certificateInfo.serialNumber,
      signature: certificateInfo.algorithm,
      issuer: certificateInfo.issuer,
      validity: {
        notBefore: certificateInfo.notBefore.toISOString(),
        notAfter: certificateInfo.notAfter.toISOString(),
      },
      subject: certificateInfo.subject,
      subjectPublicKeyInfo: await crypto.subtle.exportKey('spki', keyPair.publicKey),
      extensions: {
        keyUsage: certificateInfo.keyUsage,
        basicConstraints: { cA: false },
        subjectKeyIdentifier: certificateInfo.thumbprint,
      },
    }

    // Convert to base64 (simplified - in reality this would be proper DER encoding)
    const certString = JSON.stringify(certData)
    const base64Cert = btoa(certString)

    // Format as PEM
    let pem = '-----BEGIN CERTIFICATE-----\n'
    for (let i = 0; i < base64Cert.length; i += 64) {
      pem += base64Cert.substr(i, 64) + '\n'
    }
    pem += '-----END CERTIFICATE-----\n'

    return pem
  }

  private async exportPrivateKeyToPEM(privateKey: CryptoKey): Promise<string> {
    try {
      const exported = await crypto.subtle.exportKey('pkcs8', privateKey)
      const base64Key = btoa(String.fromCharCode(...new Uint8Array(exported)))

      let pem = '-----BEGIN PRIVATE KEY-----\n'
      for (let i = 0; i < base64Key.length; i += 64) {
        pem += base64Key.substr(i, 64) + '\n'
      }
      pem += '-----END PRIVATE KEY-----\n'

      return pem
    } catch (error) {
      throw new CertificateError(
        'Failed to export private key to PEM',
        'PEM_EXPORT_FAILED',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private async generatePKCS12(
    certificateInfo: CertificateInfo,
    keyPair: CryptoKeyPair,
    password: string
  ): Promise<ArrayBuffer> {
    // This is a placeholder implementation
    // In a real implementation, you would create proper PKCS#12 structure
    // For now, we'll create a simple container with the certificate and key data

    try {
      const certData = await this.generatePEMCertificate(certificateInfo, keyPair)
      const keyData = await this.exportPrivateKeyToPEM(keyPair.privateKey)

      const pkcs12Container = {
        version: 3,
        password: password,
        certificate: certData,
        privateKey: keyData,
        friendlyName: certificateInfo.subject,
        localKeyId: certificateInfo.thumbprint,
      }

      // Convert to ArrayBuffer (simplified)
      const containerString = JSON.stringify(pkcs12Container)
      const encoder = new TextEncoder()
      return encoder.encode(containerString).buffer
    } catch (error) {
      throw new CertificateError(
        'Failed to generate PKCS#12 data',
        'PKCS12_GENERATION_FAILED',
        error instanceof Error ? error.message : String(error)
      )
    }
  }
}