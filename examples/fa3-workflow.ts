import 'dotenv/config'
import { readFile, writeFile } from 'fs/promises'
import {
  AuthConfigBuilder,
  CertificateFormat,
  KsefClient,
  buildFa3XmlFromXsdJson,
  type Fa3XsdInvoiceInput,
  createEncryptionData,
  encryptInvoiceXml,
} from 'ksef-client'

async function main(): Promise<void> {
  const baseURL = process.env['KSEF_BASE_URL'] || 'https://ksef-test.mf.gov.pl/api'
  const nip = process.env['KSEF_NIP']
  const certPem = process.env['KSEF_CERT_PEM']
  const keyPem = process.env['KSEF_KEY_PEM']
  const certPath = process.env['KSEF_CERT_PEM_PATH']
  const keyPath = process.env['KSEF_KEY_PEM_PATH']
  const keyPassphrase = process.env['KSEF_KEY_PASSPHRASE']

  if (!nip) {
    throw new Error('Set KSEF_NIP before running this example.')
  }

  if ((!certPem || !keyPem) && (!certPath || !keyPath)) {
    throw new Error('Set KSEF_CERT_PEM/KSEF_KEY_PEM or KSEF_CERT_PEM_PATH/KSEF_KEY_PEM_PATH before running this example.')
  }

  const client = KsefClient.create({ baseURL, environment: 'test' })

  let resolvedCertPem = certPem
  let resolvedKeyPem = keyPem

  if (!resolvedCertPem || !resolvedKeyPem) {
    if (!certPath || !keyPath) {
      throw new Error('Missing KSEF_CERT_PEM_PATH or KSEF_KEY_PEM_PATH.')
    }
    resolvedCertPem = await readFile(certPath, 'utf-8')
    resolvedKeyPem = await readFile(keyPath, 'utf-8')
  }

  const normalizePem = (value: string) => value.replace(/\\n/g, '\n')
  resolvedCertPem = normalizePem(resolvedCertPem)
  resolvedKeyPem = normalizePem(resolvedKeyPem)

  const combinedPem = `${resolvedCertPem}\n${resolvedKeyPem}`.trim()

  const authBuilder = AuthConfigBuilder.create()
    .withCertificateData(new Uint8Array(Buffer.from(combinedPem, 'utf-8')))
    .withFormat(CertificateFormat.PEM)
    .withAuthMode('xades')
    .withContextIdentifier({ type: 'nip', value: nip })

  if (keyPassphrase) {
    authBuilder.withCertificatePassword(keyPassphrase)
  }

  const authConfig = authBuilder.build()

  let authResult
  try {
    authResult = await client.authenticator.authenticate(authConfig)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Authentication failed: ${message}`)
  }
  client.httpClient.addRequestInterceptor({
    onRequest: async (config: any) => ({
      ...config,
      headers: {
        ...(config.headers || {}),
        Authorization: `Bearer ${authResult.accessToken}`,
      },
    }),
  })

  const encryptionData = await createEncryptionData(client)
  const openRequest = {
    formCode: { systemCode: 'FA (3)', schemaVersion: '1-0E', value: 'FA' },
    encryption: encryptionData.encryptionInfo,
  }

  const openResponse = await client.httpClient.post<{ referenceNumber: string }>(
    '/api/v2/sessions/online',
    { body: openRequest }
  )
  const sessionId = openResponse.data?.referenceNumber
  if (!sessionId) {
    throw new Error('Failed to open session')
  }

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const invoiceNumber = `FA${today.replace(/-/g, '')}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`

  // XSD-aligned JSON shape (field names match the FA(3) schema).
  const invoiceInput: Fa3XsdInvoiceInput = {
    Faktura: {
      Naglowek: {
        KodFormularza: 'FA',
        WariantFormularza: '3',
        DataWytworzeniaFa: now.toISOString(),
        SystemInfo: 'Aplikacja Podatnika KSeF',
      },
      Podmiot1: {
        DaneIdentyfikacyjne: {
          NIP: '7431952631',
          Nazwa: 'Imie Nazwisko Nazwa',
        },
        Adres: {
          KodKraju: 'PL',
          AdresL1: 'Adres 1',
        },
        DaneKontaktowe: {
          Email: 'ksiegowosc@dentalprocess.pl',
        },
      },
      Podmiot2: {
        DaneIdentyfikacyjne: {
          NIP: '9571066971',
          Nazwa: 'INSTYTUT',
        },
        Adres: {
          KodKraju: 'PL',
          AdresL1: 'Kowale',
        },
        DaneKontaktowe: {
          Email: 'adres@klienta.pl',
        },
        JST: '2',
        GV: '2',
      },
      Fa: {
        KodWaluty: 'PLN',
        P_1: today,
        P_1M: 'Wrocław',
        P_2: invoiceNumber,
        P_6: '2026-01-10',
        P_13_7: 850,
        P_15: 850,
        Adnotacje: {
          P_16: '2',
          P_17: '2',
          P_18: '2',
          P_18A: '2',
          Zwolnienie: {
            P_19: '1',
            P_19A: 'zwolnienie ze względu na nieprzekroczenie limitu wartości sprzedaży w ubiegłym roku podatkowym (art. 113 ust. 1 i 9)',
          },
          NoweSrodkiTransportu: {
            P_22N: '1',
          },
          P_23: '2',
          PMarzy: {
            P_PMarzyN: '1',
          },
        },
        RodzajFaktury: 'VAT',
        FaWiersz: [
          {
            NrWierszaFa: 1,
            P_7: 'Usluga 001',
            P_8A: 'szt.',
            P_8B: 1,
            P_9A: 850,
            P_11: 850,
            P_12: 'zw',
          },
        ],
        Platnosc: {
          Zaplacono: '1',
          DataZaplaty: '2026-01-10',
        },
      },
      Stopka: {
        Informacje: {
          StopkaFaktury: 'dotyczy xxx',
        },
      },
    },
  }

  const invoiceXml = buildFa3XmlFromXsdJson(invoiceInput)
  const encryptedPayload = encryptInvoiceXml(
    invoiceXml,
    encryptionData.symmetricKey,
    encryptionData.initializationVector
  )

  const submitResponse = await client.httpClient.post<{ referenceNumber: string }>(
    `/api/v2/sessions/online/${sessionId}/invoices`,
    {
      body: {
        invoiceHash: encryptedPayload.invoiceHash,
        invoiceSize: encryptedPayload.invoiceSize,
        encryptedInvoiceHash: encryptedPayload.encryptedInvoiceHash,
        encryptedInvoiceSize: encryptedPayload.encryptedInvoiceSize,
        encryptedInvoiceContent: encryptedPayload.encryptedInvoiceContent,
        offlineMode: false,
      },
    }
  )

  const invoiceRef = submitResponse.data?.referenceNumber
  if (!invoiceRef) {
    throw new Error('Invoice submission failed')
  }

  const finalStatus = await waitForInvoiceStatus(client, sessionId, invoiceRef, 60)
  if (!finalStatus?.status || finalStatus.status.code !== 200) {
    throw new Error(`Invoice failed: ${JSON.stringify(finalStatus?.status)}`)
  }

  const upoUrl = finalStatus.upoDownloadUrl as string | undefined
  if (!upoUrl) {
    throw new Error('Missing UPO download URL in status response')
  }

  const upoResponse = await fetch(upoUrl)
  if (!upoResponse.ok) {
    throw new Error(`Failed to download UPO: ${upoResponse.status} ${upoResponse.statusText}`)
  }
  const upoXml = await upoResponse.text()
  const ksefNumber = finalStatus.ksefNumber
  const upoPath = `ksef-invoice-upo-${ksefNumber ?? invoiceRef}.xml`
  await writeFile(upoPath, upoXml, 'utf-8')

  await client.httpClient.post(`/api/v2/sessions/online/${sessionId}/close`, {
    body: { sessionId, generateUpo: true },
  })

  if (ksefNumber) {
    console.log(`✅ Submitted invoice ${invoiceRef} (KSeF: ${ksefNumber})`)
  } else {
    console.log(`✅ Submitted invoice ${invoiceRef}`)
  }
  console.log(`✅ UPO saved to ${upoPath}`)
  console.log(`✅ Session closed: ${sessionId}`)
}

type InvoiceStatusResponse = {
  status?: {
    code?: number
    description?: string
    details?: string[]
  }
  ksefNumber?: string
  upoDownloadUrl?: string
}

async function waitForInvoiceStatus(
  client: KsefClient,
  sessionId: string,
  invoiceRef: string,
  timeoutSeconds: number
): Promise<InvoiceStatusResponse | null> {
  const timeoutMs = Math.max(1, timeoutSeconds) * 1000
  const start = Date.now()
  let lastStatus: InvoiceStatusResponse | null = null

  while (Date.now() - start < timeoutMs) {
    const response = await client.httpClient.get<InvoiceStatusResponse>(
      `/api/v2/sessions/${sessionId}/invoices/${invoiceRef}`
    )
    const status = response.data ?? null
    if (status?.status?.code && status.status.code !== 100 && status.status.code !== 150) {
      return status
    }
    lastStatus = status ?? lastStatus
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  return lastStatus
}


main().catch((error) => {
  console.error('Workflow failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
