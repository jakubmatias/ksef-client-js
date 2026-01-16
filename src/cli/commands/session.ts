import { Command } from 'commander'
import fs from 'fs/promises'
import { CliContext, CommandResult } from '../types'
import { KsefClient, SessionBuilder } from '@/index'
import { createEncryptionData } from '@/crypto/ksef-crypto'
import { DefaultConfigManager } from '@/config/config-manager'
import { attachAccessToken, refreshAccessTokenIfNeeded } from '../auth-utils'

export function createSessionCommand(context: CliContext): Command {
  const cmd = new Command('session')
  cmd.description('Manage KSEF sessions')

  // Session open command
  cmd
    .command('open <type>')
    .description('Open a new session (online or batch)')
    .requiredOption('-n, --nip <nip>', 'NIP number (10 digits)')
    .option('-d, --description <desc>', 'Session description')
    .option('-t, --timeout <seconds>', 'Session timeout in seconds', parseInt)
    .option('--max-parts <count>', 'Maximum parts for batch session', parseInt)
    .option('--schema <schema>', 'Invoice schema for the session (FA (2) or FA (3))', 'FA (3)')
    .action(async (type, options) => {
      const result = await handleSessionOpen(context, type, options)
      await outputResult(context, result)
    })

  // Session close command
  cmd
    .command('close [sessionId]')
    .description('Close an active session')
    .option('--no-upo', 'Do not generate UPO document')
    .option('--all', 'Close all active sessions')
    .option('-u, --upo-output <file>', 'Output file path for session UPO XML')
    .action(async (sessionId, options) => {
      const result = await handleSessionClose(context, sessionId, options)
      await outputResult(context, result)
    })

  // Session status command
  cmd
    .command('status <sessionId>')
    .description('Get session status')
    .action(async (sessionId) => {
      const result = await handleSessionStatus(context, sessionId)
      await outputResult(context, result)
    })

  // Session list command
  cmd
    .command('list')
    .description('List active sessions')
    .option('--all', 'Include closed sessions')
    .action(async (options) => {
      const result = await handleSessionList(context, options)
      await outputResult(context, result)
    })

  // Session UPO command
  cmd
    .command('upo [sessionId]')
    .description('Download UPO document for session')
    .option('-o, --output <file>', 'Output file path')
    .action(async (sessionId, options) => {
      const result = await handleSessionUpo(context, sessionId, options)
      await outputResult(context, result)
    })

  // Session invoice status command
  cmd
    .command('invoice-status <sessionId> <invoiceReferenceNumber>')
    .description('Get invoice status within a session')
    .action(async (sessionId, invoiceReferenceNumber) => {
      const result = await handleSessionInvoiceStatus(context, sessionId, invoiceReferenceNumber)
      await outputResult(context, result)
    })

  return cmd
}

async function handleSessionOpen(
  context: CliContext,
  type: string,
  options: {
    nip: string
    description?: string
    timeout?: number
    maxParts?: number
    schema?: string
  }
): Promise<CommandResult> {
  try {
    if (type !== 'online' && type !== 'batch') {
      throw new Error('Session type must be "online" or "batch"')
    }

    context.logger.info(`Opening ${type} session for NIP: ${options.nip}`)

    const client = await createKsefClient(context)

    let sessionConfig
    if (type === 'online') {
      const builder = SessionBuilder.onlineForNip(options.nip)
      if (options.description) {
        builder.withDescription(options.description)
      }
      if (options.timeout) {
        builder.withTimeout(options.timeout)
      }
      sessionConfig = builder.build()
    } else {
      const builder = SessionBuilder.batchForNip(options.nip)
      if (options.description) {
        builder.withDescription(options.description)
      }
      if (options.timeout) {
        builder.withTimeout(options.timeout)
      }
      if (options.maxParts) {
        builder.withMaxParts(options.maxParts)
      }
      sessionConfig = builder.build()
    }

    context.logger.debug('Session configuration:', sessionConfig)

    const schema = options.schema ?? 'FA (3)'
    if (schema !== 'FA (2)' && schema !== 'FA (3)') {
      throw new Error('Unsupported schema. Use "FA (2)" or "FA (3)".')
    }

    const encryptionData = await createEncryptionData(client)
    const openRequest = {
      formCode: {
        systemCode: schema,
        schemaVersion: '1-0E',
        value: 'FA',
      },
      encryption: encryptionData.encryptionInfo,
    }

    const endpoint = type === 'batch' ? '/api/v2/sessions/batch' : '/api/v2/sessions/online'
    const response = await client.httpClient.post<{ referenceNumber: string; validUntil: string }>(
      endpoint,
      { body: openRequest }
    )

    if (!response.data?.referenceNumber) {
      throw new Error('Empty response from session open')
    }

    const sessionId = response.data.referenceNumber
    const sessionRecord = {
      sessionId,
      sessionType: type,
      status: 'active',
      nip: options.nip,
      description: options.description,
      createdAt: new Date().toISOString(),
      expiresAt: response.data.validUntil,
    }

    const existingSessions = (context.config.sessions && typeof context.config.sessions === 'object' && !Array.isArray(context.config.sessions))
      ? context.config.sessions
      : {}

    context.config.sessions = {
      ...existingSessions,
      [sessionId]: {
        symmetricKey: encryptionData.symmetricKey.toString('base64'),
        initializationVector: encryptionData.initializationVector.toString('base64'),
        schema,
      },
    }

    const configManager = new DefaultConfigManager()
    context.config.lastSessionId = sessionId
    await configManager.saveConfig(context.config, context.configFilePath)

    context.logger.success(`${type.charAt(0).toUpperCase() + type.slice(1)} session opened: ${sessionId}`)

    return {
      success: true,
      data: sessionRecord,
      message: `Session ${sessionId} created successfully`,
    }
  } catch (error) {
    context.logger.error('Failed to open session')
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function handleSessionClose(
  context: CliContext,
  sessionId: string | undefined,
  options: { upo?: boolean; all?: boolean; upoOutput?: string }
): Promise<CommandResult> {
  try {
    if (options.all) {
      if (options.upoOutput) {
        throw new Error('Cannot use --upo-output with --all. Close sessions one by one to set output paths.')
      }
      return await closeAllSessions(context)
    }

    const effectiveSessionId = sessionId ?? context.config.lastSessionId
    if (!effectiveSessionId) {
      throw new Error('Missing sessionId. Provide it or open a session first to set a default.')
    }

    context.logger.info(`Closing session: ${effectiveSessionId}`)

    const client = await createKsefClient(context)
    const generateUpo = options.upo !== false
    await closeSessionById(client, effectiveSessionId, generateUpo)

    let upoResult: { output: string; upoReferenceNumber: string } | null = null
    if (generateUpo) {
      upoResult = await downloadSessionUpo(context, effectiveSessionId, options.upoOutput)
    }

    if (context.config.lastSessionId === effectiveSessionId) {
      delete context.config.lastSessionId
      const configManager = new DefaultConfigManager()
      await configManager.saveConfig(context.config, context.configFilePath)
    }

    context.logger.success(`Session closed: ${effectiveSessionId}`)

    return {
      success: true,
      data: { sessionId: effectiveSessionId, upo: upoResult },
      message: 'Session closed successfully',
    }
  } catch (error) {
    context.logger.error('Failed to close session')
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function closeAllSessions(context: CliContext): Promise<CommandResult> {
  const client = await createKsefClient(context)
  const closed: string[] = []

  const onlineIds = await listActiveSessionIds(client, 'Online')
  const batchIds = await listActiveSessionIds(client, 'Batch')
  const allIds = [...onlineIds, ...batchIds]

  if (allIds.length === 0) {
    return {
      success: true,
      data: { closed: [] },
      message: 'No active sessions found',
    }
  }

  for (const id of allIds) {
    await closeSessionById(client, id, true)
    closed.push(id)
  }

  context.logger.success(`Closed ${closed.length} sessions`)
  return {
    success: true,
    data: { closed },
    message: 'All active sessions closed',
  }
}

async function listActiveSessionIds(
  client: KsefClient,
  sessionType: 'Online' | 'Batch'
): Promise<string[]> {
  const query = new URLSearchParams({
    sessionType,
    statuses: 'InProgress',
    pageSize: '100',
  })

  const response = await client.httpClient.get<{
    sessions: Array<{ referenceNumber: string }>
    continuationToken?: string | null
  }>(`/api/v2/sessions?${query.toString()}`)

  return response.data?.sessions?.map(item => item.referenceNumber) ?? []
}

async function closeSessionById(
  client: KsefClient,
  sessionId: string,
  generateUpo: boolean
): Promise<void> {
  if (sessionId.includes('-SB-')) {
    await client.httpClient.post(`/api/v2/sessions/batch/${sessionId}/close`, {
      body: { sessionId, generateUpo },
    })
    return
  }

  await client.httpClient.post(`/api/v2/sessions/online/${sessionId}/close`, {
    body: { sessionId, generateUpo },
  })
}

async function handleSessionStatus(context: CliContext, sessionId: string): Promise<CommandResult> {
  try {
    context.logger.info(`Getting status for session: ${sessionId}`)

    const client = await createKsefClient(context)

    if (sessionId.includes('-SO-') || sessionId.includes('-SB-')) {
      const response = await client.httpClient.get(`/api/v2/sessions/${sessionId}`)
      if (!response.data) {
        throw new Error('Empty response from session status')
      }

      context.logger.success('Session status retrieved')
      return {
        success: true,
        data: response.data,
        message: 'Status retrieved successfully',
      }
    }

    if (sessionId.includes('-AU-')) {
      const response = await client.httpClient.get<{
        items: Array<{
          referenceNumber: string
          startDate: string
          authenticationMethod: string
          status: {
            code: number
            description: string
            details?: string[]
          }
          isTokenRedeemed: boolean
        }>
      }>('/api/v2/auth/sessions')

      if (!response.data) {
        throw new Error('Empty response from auth sessions')
      }

      const match = response.data.items.find(item => item.referenceNumber === sessionId)
      if (!match) {
        throw new Error('Auth session not found')
      }

      context.logger.success('Auth session status retrieved')
      return {
        success: true,
        data: match,
        message: 'Status retrieved successfully',
      }
    }

    throw new Error('Unknown session type')
  } catch (error) {
    context.logger.error('Failed to get session status')
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function handleSessionList(
  context: CliContext,
  options: { all?: boolean }
): Promise<CommandResult> {
  try {
    context.logger.info('Listing sessions...')

    const client = await createKsefClient(context)

    const response = await client.httpClient.get<{
      continuationToken: string | null
      items: Array<{
        startDate: string
        authenticationMethod: string
        status: {
          code: number
          description: string
          details?: string[]
        }
        isTokenRedeemed: boolean
        referenceNumber: string
      }>
    }>('/api/v2/auth/sessions')

    if (!response.data) {
      throw new Error('Empty response from session list')
    }

    const items = options.all ? response.data.items : response.data.items
    context.logger.success(`Found ${items.length} sessions`)

    return {
      success: true,
      data: {
        continuationToken: response.data.continuationToken,
        items,
      },
      message: 'Sessions retrieved successfully',
    }
  } catch (error) {
    context.logger.error('Failed to list sessions')
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function handleSessionUpo(
  context: CliContext,
  sessionId: string | undefined,
  options: { output?: string }
): Promise<CommandResult> {
  try {
    const effectiveSessionId = sessionId ?? context.config.lastSessionId
    if (!effectiveSessionId) {
      throw new Error('Missing sessionId. Provide it or open a session first to set a default.')
    }

    const upoResult = await downloadSessionUpo(context, effectiveSessionId, options.output)

    return {
      success: true,
      data: upoResult,
      message: 'UPO retrieved successfully',
    }
  } catch (error) {
    context.logger.error('Failed to get UPO')
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function downloadSessionUpo(
  context: CliContext,
  sessionId: string,
  outputOverride?: string
): Promise<{ output: string; upoReferenceNumber: string }> {
  context.logger.info(`Getting UPO for session: ${sessionId}`)

  const client = await createKsefClient(context)
  const timeoutMs = 30000
  const intervalMs = 2000
  const deadline = Date.now() + timeoutMs
  let lastError: Error | null = null

  while (Date.now() <= deadline) {
    const statusResponse = await client.httpClient.get<{
      status?: { code?: number; description?: string }
      upo?: { pages?: Array<{ referenceNumber: string; downloadUrl?: string }> }
    }>(`/api/v2/sessions/${sessionId}`)

    const pages = statusResponse.data?.upo?.pages ?? []
    if (pages.length === 0) {
      await delay(intervalMs)
      continue
    }

    const upoPage = pages[0]
    try {
      const response = await client.httpClient.get<string>(
        `/api/v2/sessions/${sessionId}/upo/${upoPage.referenceNumber}`,
        { headers: { accept: 'application/xml' } }
      )
      if (!response.data) {
        throw new Error('Empty UPO response')
      }

      const outputPath = outputOverride ?? `ksef-session-upo-${sessionId}-${upoPage.referenceNumber}.xml`
      await fs.writeFile(outputPath, response.data, 'utf-8')
      context.logger.success(`UPO saved to ${outputPath}`)

      return { output: outputPath, upoReferenceNumber: upoPage.referenceNumber }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      await delay(intervalMs)
    }
  }

  throw lastError ?? new Error('UPO is not available for this session yet')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function handleSessionInvoiceStatus(
  context: CliContext,
  sessionId: string,
  invoiceReferenceNumber: string
): Promise<CommandResult> {
  try {
    context.logger.info(`Getting invoice status for session ${sessionId}`)

    const client = await createKsefClient(context)
    const response = await client.httpClient.get(
      `/api/v2/sessions/${sessionId}/invoices/${invoiceReferenceNumber}`
    )

    if (!response.data) {
      throw new Error('Empty response from invoice status')
    }

    context.logger.success('Invoice status retrieved')
    return {
      success: true,
      data: response.data,
      message: 'Invoice status retrieved successfully',
    }
  } catch (error) {
    context.logger.error('Failed to get session invoice status')
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
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
    context.logger.error(result.error ?? 'Command failed')
    process.exit(1)
  }
}
