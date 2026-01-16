import { createHash, createPublicKey, publicEncrypt, randomBytes, createCipheriv, constants } from 'crypto'
import type { KsefClient } from '@/index'

export interface EncryptionData {
  symmetricKey: Buffer
  initializationVector: Buffer
  encryptionInfo: {
    encryptedSymmetricKey: string
    initializationVector: string
  }
}

export async function createEncryptionData(client: KsefClient): Promise<EncryptionData> {
  const response = await client.httpClient.get<Array<{
    certificate: string
    usage: string[]
  }>>('/api/v2/security/public-key-certificates')

  if (!response.data || !Array.isArray(response.data)) {
    throw new Error('Failed to load public key certificates')
  }

  const cert = response.data.find(entry => entry.usage.includes('SymmetricKeyEncryption'))
  if (!cert) {
    throw new Error('No symmetric key encryption certificate available')
  }

  const pem = wrapPem(cert.certificate)
  const publicKey = createPublicKey(pem)
  const symmetricKey = randomBytes(32)
  const iv = randomBytes(16)

  const encryptedKey = publicEncrypt(
    {
      key: publicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    symmetricKey
  )

  return {
    symmetricKey,
    initializationVector: iv,
    encryptionInfo: {
      encryptedSymmetricKey: encryptedKey.toString('base64'),
      initializationVector: iv.toString('base64'),
    },
  }
}

export function encryptInvoiceXml(xml: string, symmetricKey: Buffer, iv: Buffer): {
  invoiceHash: string
  invoiceSize: number
  encryptedInvoiceHash: string
  encryptedInvoiceSize: number
  encryptedInvoiceContent: string
} {
  const xmlBytes = Buffer.from(xml, 'utf-8')
  const invoiceHash = createHash('sha256').update(xmlBytes).digest('base64')

  const cipher = createCipheriv('aes-256-cbc', symmetricKey, iv)
  const encrypted = Buffer.concat([cipher.update(xmlBytes), cipher.final()])
  const encryptedInvoiceHash = createHash('sha256').update(encrypted).digest('base64')

  return {
    invoiceHash,
    invoiceSize: xmlBytes.length,
    encryptedInvoiceHash,
    encryptedInvoiceSize: encrypted.length,
    encryptedInvoiceContent: encrypted.toString('base64'),
  }
}

function wrapPem(certificateBase64: string): string {
  const lines = certificateBase64.match(/.{1,64}/g) || [certificateBase64]
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`
}
