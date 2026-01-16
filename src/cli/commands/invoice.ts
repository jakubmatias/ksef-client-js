import { Command } from 'commander'
import { CliContext, CommandResult } from '../types'
import fs from 'fs/promises'
import { KsefClient } from '@/index'
import { encryptInvoiceXml } from '@/crypto/ksef-crypto'
import { attachAccessToken, refreshAccessTokenIfNeeded } from '../auth-utils'
import { buildFa2XmlFromJson, buildFa3XmlFromJson, buildFa3XmlFromXsdJson } from '@/invoice/xml-builder'

export function createInvoiceCommand(context: CliContext): Command {
  const cmd = new Command('invoice')
  cmd.description('Manage invoices in KSEF')

  // Invoice submit command
  cmd
    .command('submit [sessionId]')
    .description('Submit invoice to session')
    .option('-i, --input <path>', 'Invoice data file (JSON or XML)')
    .option('--stdin', 'Read invoice data from stdin')
    .option('--validate-only', 'Only validate, do not submit')
    .option('--wait-status', 'Wait for invoice processing status')
    .option('--wait-timeout <seconds>', 'Wait timeout in seconds', parseInt, 30)
    .option('--require-success', 'Fail unless invoice status code is 200')
    .option('--skip-upo', 'Skip downloading invoice UPO after status is available')
    .action(async (sessionId, options) => {
      const result = await handleInvoiceSubmit(context, sessionId, options)
      await outputResult(context, result)
    })

  // Invoice validate command
  cmd
    .command('validate [sessionId]')
    .description('Validate invoice without submitting')
    .option('-i, --input <path>', 'Invoice data file (JSON or XML)')
    .option('--stdin', 'Read invoice data from stdin')
    .action(async (sessionId, options) => {
      const result = await handleInvoiceValidate(context, sessionId, options)
      await outputResult(context, result)
    })

  // Invoice query command
  cmd
    .command('query')
    .description('Query invoices')
    .option('--from <date>', 'From date (YYYY-MM-DD)')
    .option('--to <date>', 'To date (YYYY-MM-DD)')
    .option('--nip <nip>', 'Filter by NIP')
    .option('--number <number>', 'Filter by invoice number')
    .option('--ksef-ref <ref>', 'Filter by KSeF reference number')
    .option('--subject-type <type>', 'Subject type (Subject1|Subject2|Subject3|SubjectAuthorized)', 'Subject1')
    .option('--date-type <type>', 'Date type (Issue|Invoicing|PermanentStorage)', 'Issue')
    .option('--page-size <size>', 'Page size', parseInt)
    .option('--page-offset <offset>', 'Page offset', parseInt)
    .action(async (options) => {
      const result = await handleInvoiceQuery(context, options)
      await outputResult(context, result)
    })

  // Invoice download command
  cmd
    .command('download <ksefReferenceNumber>')
    .description('Download invoice by KSeF reference number')
    .option('--format <format>', 'Download format (xml, pdf)', 'xml')
    .option('-o, --output <file>', 'Output file path')
    .action(async (ksefReferenceNumber, options) => {
      const result = await handleInvoiceDownload(context, ksefReferenceNumber, options)
      await outputResult(context, result)
    })

  // Invoice status command
  cmd
    .command('status [invoiceReferenceNumber]')
    .description('Get invoice status (session reference) or metadata (KSeF number)')
    .option('-s, --session-id <sessionId>', 'Session reference number (defaults to last session)')
    .option('--ksef-number <ksefNumber>', 'Lookup by KSeF number via invoice metadata')
    .option('--subject-type <type>', 'Subject type (Subject1|Subject2|Subject3|SubjectAuthorized)', 'Subject1')
    .option('--date-type <type>', 'Date type (Issue|Invoicing|PermanentStorage)', 'Issue')
    .option('--from <date>', 'From date (YYYY-MM-DD)')
    .option('--to <date>', 'To date (YYYY-MM-DD)')
    .action(async (invoiceReferenceNumber, options) => {
      const result = await handleInvoiceStatus(context, invoiceReferenceNumber, options)
      await outputResult(context, result)
    })

  return cmd
}

async function handleInvoiceSubmit(
  context: CliContext,
  sessionId: string | undefined,
  options: {
    input?: string
    stdin?: boolean
    validateOnly?: boolean
    waitStatus?: boolean
    waitTimeout?: number
    requireSuccess?: boolean
    skipUpo?: boolean
  }
): Promise<CommandResult> {
  try {
    const effectiveSessionId = sessionId ?? context.config.lastSessionId
    if (!effectiveSessionId) {
      throw new Error('Missing sessionId. Provide it or open a session first to set a default.')
    }

    context.logger.info(`Submitting invoice to session: ${effectiveSessionId}`)

    if (options.validateOnly) {
      throw new Error('Not implemented')
    }

    const invoicePayloads = await loadInvoiceXmlPayloads(options)
    const encryption = context.config.sessions?.[effectiveSessionId]
    if (!encryption) {
      throw new Error(`Missing encryption data for session ${effectiveSessionId}. Open the session using the CLI first.`)
    }

    const payloadSchemas = new Set(
      invoicePayloads.map((payload) => payload.schema).filter((schema): schema is string => Boolean(schema))
    )
    if (payloadSchemas.size > 1) {
      throw new Error('Mixed invoice schemas in one submission are not supported. Submit FA(2) and FA(3) separately.')
    }
    const payloadSchema = payloadSchemas.values().next().value as string | undefined
    if (payloadSchema && encryption.schema && payloadSchema !== encryption.schema) {
      throw new Error(
        `Invoice schema ${payloadSchema} does not match session schema ${encryption.schema}. Open a session with --schema "${payloadSchema}".`
      )
    }

    const client = await createKsefClient(context)
    const results: Array<{ referenceNumber: string; status: unknown | null; upoPath?: string; error?: string }> = []
    let hasFailures = false

    for (const invoicePayload of invoicePayloads) {
      try {
        const invoiceXml = invoicePayload.xml
        const encryptedPayload = encryptInvoiceXml(
          invoiceXml,
          Buffer.from(encryption.symmetricKey, 'base64'),
          Buffer.from(encryption.initializationVector, 'base64')
        )

        const requestBody = {
          invoiceHash: encryptedPayload.invoiceHash,
          invoiceSize: encryptedPayload.invoiceSize,
          encryptedInvoiceHash: encryptedPayload.encryptedInvoiceHash,
          encryptedInvoiceSize: encryptedPayload.encryptedInvoiceSize,
          encryptedInvoiceContent: encryptedPayload.encryptedInvoiceContent,
          offlineMode: false,
        }

        const response = await client.httpClient.post<{ referenceNumber: string }>(
          `/api/v2/sessions/online/${effectiveSessionId}/invoices`,
          { body: requestBody }
        )

        if (!response.data?.referenceNumber) {
          throw new Error('Empty response from invoice submission')
        }

        const invoiceRef = response.data.referenceNumber
        const immediateStatus = await tryGetInvoiceStatus(client, effectiveSessionId, invoiceRef)

        if (immediateStatus?.status?.code && immediateStatus.status.code >= 400) {
          const error = formatInvoiceStatusError(invoiceRef, immediateStatus)
          results.push({ referenceNumber: invoiceRef, status: immediateStatus, error })
          context.logger.error(error)
          hasFailures = true
          continue
        }

        let finalStatus = immediateStatus
        if (options.waitStatus) {
          finalStatus = await waitForInvoiceStatus(
            client,
            effectiveSessionId,
            invoiceRef,
            options.waitTimeout ?? 30
          )
          if (finalStatus?.status?.code && finalStatus.status.code >= 400) {
            const error = formatInvoiceStatusError(invoiceRef, finalStatus)
            results.push({ referenceNumber: invoiceRef, status: finalStatus, error })
            context.logger.error(error)
            hasFailures = true
            continue
          }
          if (options.requireSuccess && finalStatus?.status?.code !== 200) {
            const error = formatInvoiceStatusError(invoiceRef, finalStatus)
            results.push({ referenceNumber: invoiceRef, status: finalStatus, error })
            context.logger.error(error)
            hasFailures = true
            continue
          }
        }

        let upoPath: string | undefined
        if (!options.skipUpo && finalStatus) {
          upoPath = await downloadInvoiceUpo(invoiceRef, finalStatus)
        }

        results.push({ referenceNumber: invoiceRef, status: finalStatus ?? immediateStatus ?? null, upoPath })
        const ksefNumber = (finalStatus as { ksefNumber?: string } | null)?.ksefNumber
          ?? (immediateStatus as { ksefNumber?: string } | null)?.ksefNumber
        const successLabel = ksefNumber
          ? `Invoice submitted: ${invoiceRef} (KSeF: ${ksefNumber})`
          : `Invoice submitted: ${invoiceRef}`
        context.logger.success(successLabel)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        results.push({ referenceNumber: 'unknown', status: null, error: errorMessage })
        context.logger.error(errorMessage)
        hasFailures = true
      }
    }

    return {
      success: !hasFailures,
      data: results.length === 1 ? results[0] : results,
      message: hasFailures
        ? `Submitted ${results.length} invoice(s) with errors`
        : `Submitted ${results.length} invoice(s)`,
    }
  } catch (error) {
    context.logger.error('Failed to submit invoice')
    return {
      success: false,
      error: formatHttpError(error),
    }
  }
}

async function handleInvoiceValidate(
  context: CliContext,
  sessionId: string | undefined,
  options: {
    input?: string
    stdin?: boolean
  }
): Promise<CommandResult> {
  void context
  void sessionId
  void options
  return {
    success: false,
    error: 'Not implemented',
  }
}

async function handleInvoiceQuery(
  context: CliContext,
  options: {
    from?: string
    to?: string
    nip?: string
    number?: string
    ksefRef?: string
    subjectType?: string
    dateType?: string
    pageSize?: number
    pageOffset?: number
  }
): Promise<CommandResult> {
  try {
    context.logger.info('Querying invoices...')

    const client = await createKsefClient(context)

    const from = options.from ? toIsoDateTime(options.from, 'start') : toIsoDateTime(undefined, 'start')
    const to = options.to ? toIsoDateTime(options.to, 'end') : undefined

    const requestBody: Record<string, unknown> = {
      subjectType: options.subjectType ?? 'Subject1',
      dateRange: {
        dateType: options.dateType ?? 'Issue',
        from,
        ...(to && { to }),
      },
      ...(options.ksefRef && { ksefNumber: options.ksefRef }),
      ...(options.number && { invoiceNumber: options.number }),
      ...(options.nip && { seller: { identifier: options.nip } }),
    }

    context.logger.debug('Query request:', requestBody)

    const queryParams = new URLSearchParams()
    if (options.pageOffset !== undefined) {
      queryParams.set('pageOffset', String(options.pageOffset))
    }
    if (options.pageSize !== undefined) {
      queryParams.set('pageSize', String(options.pageSize))
    }

    const url = queryParams.toString()
      ? `/api/v2/invoices/query/metadata?${queryParams.toString()}`
      : '/api/v2/invoices/query/metadata'

    const response = await client.httpClient.post<{ invoices: unknown[]; totalCount?: number; hasMore: boolean }>(
      url,
      { body: requestBody }
    )

    if (!response.data) {
      throw new Error('Empty response from invoice query')
    }

    const totalCount = response.data.totalCount ?? response.data.invoices.length
    context.logger.success(`Found ${totalCount} invoices`)

    return {
      success: true,
      data: response.data,
      message: `Query completed, found ${totalCount} invoices`,
    }
  } catch (error) {
    context.logger.error('Failed to query invoices')
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function handleInvoiceDownload(
  context: CliContext,
  ksefReferenceNumber: string,
  options: {
    format: string
    output?: string
  }
): Promise<CommandResult> {
  try {
    context.logger.info(`Downloading invoice: ${ksefReferenceNumber}`)

    void options
    void ksefReferenceNumber
    throw new Error('Not implemented')
  } catch (error) {
    context.logger.error('Failed to download invoice')
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function handleInvoiceStatus(
  context: CliContext,
  invoiceReferenceNumber: string | undefined,
  options: {
    sessionId?: string
    ksefNumber?: string
    subjectType?: string
    dateType?: string
    from?: string
    to?: string
  }
): Promise<CommandResult> {
  try {
    if (options.ksefNumber) {
      if (invoiceReferenceNumber) {
        throw new Error('Provide either invoice reference number or --ksef-number, not both.')
      }

      context.logger.info(`Getting metadata for KSeF invoice: ${options.ksefNumber}`)

      const client = await createKsefClient(context)
      const from = options.from ? toIsoDateTime(options.from, 'start') : '2000-01-01T00:00:00.000Z'
      const to = options.to ? toIsoDateTime(options.to, 'end') : undefined

      const requestBody: Record<string, unknown> = {
        subjectType: options.subjectType ?? 'Subject1',
        dateRange: {
          dateType: options.dateType ?? 'Issue',
          from,
          ...(to && { to }),
        },
        ksefNumber: options.ksefNumber,
      }

      const response = await client.httpClient.post<{ invoices: unknown[]; hasMore: boolean }>(
        '/api/v2/invoices/query/metadata',
        { body: requestBody }
      )

      if (!response.data) {
        throw new Error('Empty response from invoice metadata query')
      }

      const invoice = response.data.invoices[0]
      if (!invoice) {
        throw new Error('Invoice not found for the provided KSeF number')
      }

      return {
        success: true,
        data: invoice,
        message: 'Invoice metadata retrieved successfully',
      }
    }

    if (!invoiceReferenceNumber) {
      throw new Error('Missing invoice reference number. Provide it or use --ksef-number.')
    }

    const effectiveSessionId = options.sessionId ?? context.config.lastSessionId
    if (!effectiveSessionId) {
      throw new Error('Missing sessionId. Provide --session-id or open a session first to set a default.')
    }

    context.logger.info(`Getting status for invoice: ${invoiceReferenceNumber}`)

    const client = await createKsefClient(context)
    const response = await client.httpClient.get(
      `/api/v2/sessions/${effectiveSessionId}/invoices/${invoiceReferenceNumber}`
    )

    if (!response.data) {
      throw new Error('Empty response from invoice status')
    }

    return {
      success: true,
      data: response.data,
      message: 'Invoice status retrieved successfully',
    }
  } catch (error) {
    context.logger.error('Failed to get invoice status')
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function downloadInvoiceUpo(referenceNumber: string, status: any): Promise<string | undefined> {
  const url = status?.upoDownloadUrl
  if (!url || typeof url !== 'string') {
    return undefined
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download UPO for ${referenceNumber}: ${response.status} ${response.statusText}`)
  }

  const data = await response.text()
  const ksefNumber = (status as { ksefNumber?: string } | null)?.ksefNumber
  const outputPath = ksefNumber
    ? `ksef-invoice-upo-${ksefNumber}.xml`
    : `ksef-invoice-upo-${referenceNumber}.xml`
  await fs.writeFile(outputPath, data, 'utf-8')
  return outputPath
}

async function readFromStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''

    process.stdin.setEncoding('utf8')

    process.stdin.on('readable', () => {
      const chunk = process.stdin.read()
      if (chunk !== null) {
        data += chunk
      }
    })

    process.stdin.on('end', () => {
      resolve(data)
    })

    process.stdin.on('error', (error) => {
      reject(error)
    })
  })
}

async function readFromFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8')
}

async function loadInvoiceXmlPayloads(options: { input?: string; stdin?: boolean }): Promise<Array<{ xml: string; schema: string | null }>> {
  let rawInput: string
  if (options.stdin) {
    rawInput = await readFromStdin()
  } else if (options.input) {
    rawInput = await readFromFile(options.input)
  } else {
    throw new Error('Either --input or --stdin must be specified')
  }

  const trimmed = rawInput.trim()
  if (trimmed.startsWith('<')) {
    return [{ xml: trimmed, schema: null }]
  }

  let parsed: {
    invoiceXml?: string
    xmlPath?: string
    placeholders?: Record<string, string>
    schema?: string
    type?: string
    formCode?: { systemCode?: string }
    seller?: unknown
    buyer?: unknown
    header?: unknown
    lines?: unknown
    invoices?: Array<{ invoiceXml?: string; xmlPath?: string; placeholders?: Record<string, string> }>
  }
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    throw new Error(`Invalid JSON input: ${error}`)
  }

  if (Array.isArray(parsed.invoices)) {
    const results: Array<{ xml: string; schema: string | null }> = []
    for (const item of parsed.invoices) {
      results.push(await resolveInvoicePayload(item))
    }
    return results
  }

  return [await resolveInvoicePayload(parsed)]
}

async function resolveInvoicePayload(input: {
  invoiceXml?: string
  xmlPath?: string
  placeholders?: Record<string, string>
  schema?: string
  type?: string
  formCode?: { systemCode?: string }
  Faktura?: unknown
  seller?: {
    nip: string
    name: string
    addressL1: string
    addressL2: string
    email?: string
    phone?: string
  }
  buyer?: {
    nip: string
    name: string
    addressL1: string
    addressL2: string
    email?: string
    phone?: string
    clientNumber?: string
  }
  header?: {
    invoiceNumber: string
    issueDate: string
    saleDate: string
    place?: string
    currency?: string
    systemInfo?: string
    annotations?: {
      P_16?: string
      P_17?: string
      P_18?: string
      P_18A?: string
      Zwolnienie?: { P_19N?: string }
      NoweSrodkiTransportu?: { P_22N?: string }
      P_23?: string
      PMarzy?: { P_PMarzyN?: string }
    }
  }
  lines?: Array<{
    name: string
    unit?: string
    quantity: number
    unitPrice: number
    vatRatePercent: number
  }>
}): Promise<{ xml: string; schema: string | null }> {
  let xml = ''
  let schema: string | null = null

  if (isFa2JsonInvoice(input)) {
    schema = 'FA (2)'
  } else if (isFa3JsonInvoice(input)) {
    schema = 'FA (3)'
  }

  if (!schema && hasInvoiceJsonShape(input)) {
    schema = 'FA (3)'
  }
  if (!schema && isFa3XsdJsonInvoice(input)) {
    schema = 'FA (3)'
  }

  if (input.invoiceXml) {
    xml = input.invoiceXml
  } else if (input.xmlPath) {
    xml = await readFromFile(input.xmlPath)
  } else if (isFa3XsdJsonInvoice(input)) {
    xml = buildFa3XmlFromXsdJson(input as { Faktura: any })
  } else if (schema === 'FA (2)') {
    xml = buildFa2XmlFromJson(input)
  } else if (schema === 'FA (3)') {
    xml = buildFa3XmlFromJson(input)
  } else {
    throw new Error('invoiceXml or xmlPath must be provided in JSON input')
  }

  if (input.placeholders) {
    for (const [key, value] of Object.entries(input.placeholders)) {
      xml = xml.replace(new RegExp(`#${key}#`, 'g'), value)
    }
  }

  return { xml, schema }
}

function hasInvoiceJsonShape(input: {
  header?: unknown
  seller?: unknown
  buyer?: unknown
  lines?: unknown
}): boolean {
  return Boolean(input.header && input.seller && input.buyer && Array.isArray(input.lines))
}

function isFa2JsonInvoice(input: {
  schema?: string
  type?: string
  formCode?: { systemCode?: string }
  header?: unknown
  seller?: unknown
  buyer?: unknown
  lines?: unknown
}): boolean {
  const systemCode = input.formCode?.systemCode
  const schema = input.schema
  const type = input.type
  return Boolean(
    (schema && schema.includes('FA (2)')) ||
    type === 'fa2' ||
    systemCode === 'FA (2)'
  )
}

function isFa3JsonInvoice(input: {
  schema?: string
  type?: string
  formCode?: { systemCode?: string }
  header?: unknown
  seller?: unknown
  buyer?: unknown
  lines?: unknown
}): boolean {
  const systemCode = input.formCode?.systemCode
  const schema = input.schema
  const type = input.type
  return Boolean(
    (schema && schema.includes('FA (3)')) ||
    type === 'fa3' ||
    systemCode === 'FA (3)'
  )
}

function isFa3XsdJsonInvoice(input: { Faktura?: unknown }): boolean {
  const faktura = input.Faktura as { Naglowek?: { KodFormularza?: unknown } } | undefined
  return Boolean(faktura?.Naglowek)
}

function toIsoDateTime(input?: string, boundary: 'start' | 'end' = 'start'): string {
  if (!input) {
    const now = new Date()
    const fallback = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    fallback.setUTCHours(0, 0, 0, 0)
    return fallback.toISOString()
  }

  const date = new Date(`${input}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${input}. Expected YYYY-MM-DD.`)
  }

  if (boundary === 'end') {
    date.setUTCHours(23, 59, 59, 999)
  }

  return date.toISOString()
}

async function tryGetInvoiceStatus(
  client: KsefClient,
  sessionId: string,
  invoiceReferenceNumber: string
): Promise<any | null> {
  try {
    const response = await client.httpClient.get(
      `/api/v2/sessions/${sessionId}/invoices/${invoiceReferenceNumber}`
    )
    return response.data ?? null
  } catch (_error) {
    return null
  }
}

async function waitForInvoiceStatus(
  client: KsefClient,
  sessionId: string,
  invoiceReferenceNumber: string,
  timeoutSeconds: number
): Promise<any | null> {
  const timeoutMs = Math.max(1, timeoutSeconds) * 1000
  const start = Date.now()
  let lastStatus: any | null = null

  while (Date.now() - start < timeoutMs) {
    const status = await tryGetInvoiceStatus(client, sessionId, invoiceReferenceNumber)
    if (status?.status?.code && status.status.code !== 100 && status.status.code !== 150) {
      return status
    }
    lastStatus = status ?? lastStatus
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  return lastStatus
}

function formatInvoiceStatusError(referenceNumber: string, status: any): string {
  const statusCode = status?.status?.code
  const description = status?.status?.description
  const details = Array.isArray(status?.status?.details) ? status.status.details.join('; ') : undefined
  const detailText = details ? ` Details: ${details}` : ''
  return `Invoice ${referenceNumber} failed with status ${statusCode}: ${description ?? 'Unknown'}.${detailText}`
}

function formatHttpError(error: unknown): string {
  const maybeHttp = error as { message?: string; response?: any }
  const responseData = maybeHttp.response?.data as { exception?: { exceptionDetailList?: unknown } } | undefined
  const exceptionDetails = responseData?.exception?.exceptionDetailList
  const detailsText = Array.isArray(exceptionDetails)
    ? ` Details: ${JSON.stringify(exceptionDetails)}`
    : ''
  return `${maybeHttp.message ?? String(error)}${detailsText}`
}

async function createKsefClient(context: CliContext): Promise<KsefClient> {
  const baseURL = context.config.baseURL ??
    (context.config.environment === 'production'
      ? 'https://ksef.mf.gov.pl/api'
      : 'https://ksef-test.mf.gov.pl/api')

  const client = KsefClient.create({
    baseURL,
    environment: context.config.environment ?? 'test',
    ...(context.config.timeout && { timeout: context.config.timeout }),
  })

  attachAccessToken(context, client)
  await refreshAccessTokenIfNeeded(context, client)
  return client
}

async function outputResult(context: CliContext, result: CommandResult): Promise<void> {
  if (result.success) {
    if (result.data) {
      switch (context.config.format) {
        case 'json':
          console.log(JSON.stringify(result.data, null, 2))
          break
        case 'table':
          // In a real implementation, we would format as a table
          console.log('Result:', result.data)
          break
        case 'csv':
          // In a real implementation, we would format as CSV
          console.log('CSV output not implemented yet')
          break
      }
    }
    if (result.message) {
      context.logger.success(result.message)
    }
    process.exit(0)
  } else {
    if (result.data) {
      switch (context.config.format) {
        case 'json':
          console.log(JSON.stringify(result.data, null, 2))
          break
        case 'table':
          console.log('Result:', result.data)
          break
        case 'csv':
          console.log('CSV output not implemented yet')
          break
      }
    }
    context.logger.error(result.error ?? 'Command failed')
    process.exit(1)
  }
}
