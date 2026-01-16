import { Crypto } from '@peculiar/webcrypto'
import { DOMParser, DOMImplementation, XMLSerializer } from '@xmldom/xmldom'
import { Application, Parse, SignedXml, setNodeDependencies } from 'xadesjs'
import xpath from 'xpath'
import { createPrivateKey } from 'crypto'

const webcrypto = globalThis.crypto && 'subtle' in globalThis.crypto
  ? globalThis.crypto
  : new Crypto()

setNodeDependencies({
  DOMParser,
  XMLSerializer,
  DOMImplementation,
  xpath,
})

if (Application?.setEngine) {
  Application.setEngine('node', webcrypto)
}

export async function signXmlWithXades(
  xml: string,
  certificatePem: string,
  privateKeyPem: string,
  privateKeyPassword?: string
): Promise<string> {
  const xmlDoc = Parse(xml)
  const { signingKey, signAlgorithm } = await importPrivateKey(privateKeyPem, privateKeyPassword)
  const certDer = pemToDerBytes(certificatePem)
  const certBase64 = Buffer.from(certDer).toString('base64')

  const signedXml = new SignedXml()

  const references = [
    {
      uri: '',
      hash: 'SHA-256',
      transforms: [
        'enveloped',
        'http://www.w3.org/2001/10/xml-exc-c14n#',
      ],
    },
  ]

  await signedXml.Sign(signAlgorithm as any, signingKey, xmlDoc, {
    references,
    x509: [certBase64],
    xades: {
      signingCertificate: certBase64,
    },
  } as any)

  const signedXmlString = signedXml.toString()
  if (!signedXmlString.includes('<ds:Signature') && !signedXmlString.includes(':Signature')) {
    throw new Error('Signature element missing after XAdES signing')
  }
  return signedXmlString
}

async function importPrivateKey(
  privateKeyPem: string,
  passphrase?: string
): Promise<{ signingKey: CryptoKey; signAlgorithm: any }> {
  const keyObject = createPrivateKey({
    key: privateKeyPem,
    format: 'pem',
    passphrase,
  })
  const keyData = keyObject.export({ type: 'pkcs8', format: 'der' }) as Buffer
  const isEc = keyObject.asymmetricKeyType === 'ec'
  const namedCurve = isEc ? keyObject.asymmetricKeyDetails?.namedCurve : undefined

  if (isEc && !namedCurve) {
    throw new Error('ECDSA key is missing namedCurve information')
  }

  const importAlgorithm: EcKeyImportParams | RsaHashedImportParams = isEc
    ? { name: 'ECDSA', namedCurve: mapNamedCurve(namedCurve!) }
    : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
  const signAlgorithm = isEc
    ? { name: 'ECDSA', hash: 'SHA-256' }
    : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }

  const keyBytes = Uint8Array.from(keyData)
  return webcrypto.subtle.importKey('pkcs8', keyBytes, importAlgorithm, false, ['sign'])
    .then(signingKey => ({ signingKey, signAlgorithm }))
}

function mapNamedCurve(namedCurve: string): EcKeyImportParams['namedCurve'] {
  const normalized = namedCurve.toLowerCase()
  switch (normalized) {
    case 'prime256v1':
    case 'secp256r1':
      return 'P-256'
    case 'secp384r1':
      return 'P-384'
    case 'secp521r1':
      return 'P-521'
    default:
      throw new Error(`Unsupported namedCurve: ${namedCurve}`)
  }
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  const binary = Buffer.from(base64, 'base64')
  return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength)
}

function pemToDerBytes(pem: string): Uint8Array {
  return new Uint8Array(pemToArrayBuffer(pem))
}
