import { Command } from 'commander'
import fs from 'fs'
import { CliContext, CommandResult } from '../types'
import { KsefClient, AuthConfig, AuthConfigBuilder, CertificateFormat, DefaultCertificateGenerator, CertificateGenerationOptions } from '@/index'
import { DefaultConfigManager } from '@/config/config-manager'
import { getKsefBaseUrl, KsefEnvironment } from '@/config/environment'
import { attachAccessToken, refreshAccessTokenIfNeeded } from '../auth-utils'

export function createAuthCommand(context: CliContext): Command {
  const cmd = new Command('auth')
  cmd.description('Authenticate with KSEF using certificates')

  // Auth challenge command
  cmd
    .command('challenge')
    .description('Get authentication challenge from KSEF')
    .option('--save', 'Save challenge to file for manual signing')
    .action(async (options) => {
      const result = await handleAuthChallenge(context, options)
      await outputResult(context, result)
    })

  // Auth test command
  cmd
    .command('test')
    .description('Test authentication with certificate')
    .requiredOption('-c, --certificate <path>', 'Path to certificate file')
    .option('-p, --password <password>', 'Certificate password')
    .option('--cert-format <format>', 'Certificate format (pkcs12, pem, der)', 'pkcs12')
    .option('--private-key <path>', 'Private key path (PEM)')
    .option('--nip <nip>', 'Context NIP for authentication')
    .option('--verify-chain', 'Verify certificate chain (OCSP/CRL)')
    .action(async (options) => {
      const result = await handleAuthTest(context, options)
      await outputResult(context, result)
    })

  // Auth login command
  cmd
    .command('login')
    .description('Authenticate and store tokens in the config file')
    .requiredOption('-c, --certificate <path>', 'Path to certificate file')
    .option('-p, --password <password>', 'Certificate password')
    .option('--cert-format <format>', 'Certificate format (pkcs12, pem, der)', 'pkcs12')
    .option('--private-key <path>', 'Private key path (PEM)')
    .option('--nip <nip>', 'Context NIP for authentication')
    .option('--verify-chain', 'Verify certificate chain (OCSP/CRL)')
    .action(async (options) => {
      const result = await handleAuthLogin(context, options)
      await outputResult(context, result)
    })

  // Auth status command
  cmd
    .command('status [referenceNumber]')
    .description('Check authentication status')
    .action(async (referenceNumber, _options) => {
      const result = await handleAuthStatus(context, referenceNumber)
      await outputResult(context, result)
    })

  // Auth whoami command
  cmd
    .command('whoami')
    .description('Show current auth token details and validate it')
    .option('--no-validate', 'Skip token validation')
    .action(async (options) => {
      const result = await handleAuthWhoami(context, options)
      await outputResult(context, result)
    })

  // Auth logout command
  cmd
    .command('logout')
    .description('Clear stored authentication tokens')
    .action(async () => {
      const result = await handleAuthLogout(context)
      await outputResult(context, result)
    })

  // Certificate generation command
  cmd
    .command('generate-cert')
    .description('Generate a self-signed certificate for KSEF')
    .requiredOption('-n, --common-name <name>', 'Common Name (CN) for the certificate')
    .option('-o, --organization <org>', 'Organization (O)')
    .option('-u, --organizational-unit <unit>', 'Organizational Unit (OU)')
    .option('-l, --locality <locality>', 'Locality/City (L)')
    .option('-s, --state <state>', 'State/Province (ST)')
    .option('-c, --country <country>', 'Country code (C) - 2 letters', 'PL')
    .option('-e, --email <email>', 'Email address')
    .option('-d, --valid-days <days>', 'Certificate validity in days', parseInt, 365)
    .option('-k, --key-size <size>', 'Key size in bits', parseInt, 2048)
    .option('-a, --algorithm <alg>', 'Key algorithm (RSA|ECDSA)', 'RSA')
    .option('-p, --password <password>', 'Password for PKCS#12 export')
    .option('-f, --format <format>', 'Output format (pkcs12|pem|both)', 'pkcs12')
    .option('--output-cert <file>', 'Output certificate file path')
    .option('--output-key <file>', 'Output private key file path')
    .option('--output-p12 <file>', 'Output PKCS#12 file path')
    .action(async (options) => {
      const result = await handleGenerateCertificate(context, options)
      await outputResult(context, result)
    })

  return cmd
}

async function handleAuthChallenge(
  context: CliContext,
  options: { save?: boolean }
): Promise<CommandResult> {
  try {
    void options
    throw new Error('Not implemented')
  } catch (error) {
    context.logger.error('Failed to get authentication challenge')
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function handleAuthTest(
  context: CliContext,
  options: {
    certificate: string
    password?: string
    certFormat?: string
    format?: string
    privateKey?: string
    nip?: string
    verifyChain?: boolean
  }
): Promise<CommandResult> {
  try {
    context.logger.info(`Testing authentication with certificate: ${options.certificate}`)

    const client = await createKsefClient(context)

    const authConfig = buildAuthConfigFromOptions(options)

    context.logger.debug('Auth configuration built:', authConfig)

    const authResult = await client.authenticator.authenticate(authConfig)

    context.logger.success('Authentication test completed successfully')

    return {
      success: true,
      data: authResult,
      message: 'Authentication successful',
    }
  } catch (error) {
    context.logger.error('Authentication test failed')
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function handleAuthLogin(
  context: CliContext,
  options: {
    certificate: string
    password?: string
    certFormat?: string
    format?: string
    privateKey?: string
    nip?: string
    verifyChain?: boolean
  }
): Promise<CommandResult> {
  try {
    context.logger.info(`Logging in with certificate: ${options.certificate}`)

    const client = await createKsefClient(context)
    const authConfig = buildAuthConfigFromOptions(options)

    context.logger.debug('Auth configuration built:', authConfig)

    const authResult = await client.authenticator.authenticate(authConfig)

    const configManager = new DefaultConfigManager()
    const updatedConfig = {
      ...context.config,
      auth: {
        accessToken: authResult.accessToken,
        refreshToken: authResult.refreshToken,
        sessionToken: authResult.sessionToken,
        expiresAt: authResult.expiresAt.toISOString(),
        referenceNumber: authResult.referenceNumber,
      },
    }

    await configManager.saveConfig(updatedConfig, context.configFilePath)

    context.logger.success('Authentication tokens saved to config')

    return {
      success: true,
      data: authResult,
      message: 'Authentication successful',
    }
  } catch (error) {
    context.logger.error('Authentication login failed')
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function buildAuthConfigFromOptions(options: {
  certificate: string
  password?: string
  certFormat?: string
  format?: string
  privateKey?: string
  nip?: string
  verifyChain?: boolean
}): AuthConfig {
  const formatInput = options.certFormat ?? options.format ?? 'pkcs12'
  const format = formatInput as CertificateFormat
  const nip = options.nip ?? process.env['KSEF_TEST_NIP']
  if (!nip) {
    throw new Error('Missing NIP. Provide --nip or set KSEF_TEST_NIP.')
  }

  const authBuilder = AuthConfigBuilder.create()
    .withFormat(format)
    .withAuthMode('xades')
    .withContextIdentifier({ type: 'nip', value: nip })
    .withSubjectIdentifierType('certificateSubject')
    .withVerifyCertificateChain(Boolean(options.verifyChain))

  if (options.password) {
    authBuilder.withCertificatePassword(options.password)
  }

  if (format === CertificateFormat.PEM) {
    const certPem = fs.readFileSync(options.certificate, 'utf-8')
    const keyPem = options.privateKey ? fs.readFileSync(options.privateKey, 'utf-8') : ''
    const combinedPem = `${certPem}\n${keyPem}`.trim()
    const hasPrivateKey = /BEGIN (EC |RSA )?PRIVATE KEY|BEGIN ENCRYPTED PRIVATE KEY/.test(combinedPem)
    if (!hasPrivateKey) {
      throw new Error('PEM private key not found. Provide --private-key or a combined PEM file.')
    }
    authBuilder.withCertificateData(new Uint8Array(Buffer.from(combinedPem, 'utf-8')))
  } else {
    const certificateData = fs.readFileSync(options.certificate)
    authBuilder.withCertificateData(new Uint8Array(certificateData))
  }

  return authBuilder.build()
}

async function handleAuthStatus(
  context: CliContext,
  referenceNumber?: string
): Promise<CommandResult> {
  try {
    const sessionToken = context.config.auth?.sessionToken
    if (!sessionToken) {
      throw new Error('Missing auth session token. Run "ksef auth login" first.')
    }

    const effectiveReferenceNumber = referenceNumber ?? context.config.auth?.referenceNumber
    if (!effectiveReferenceNumber) {
      throw new Error('Missing reference number. Provide it or re-authenticate to store it.')
    }

    const client = await createKsefClient(context)
    const response = await client.httpClient.get(
      `/api/v2/auth/${effectiveReferenceNumber}`,
      {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      }
    )

    if (!response.data) {
      throw new Error('Empty response from authentication status')
    }

    return {
      success: true,
      data: response.data,
      message: 'Authentication status retrieved successfully',
    }
  } catch (error) {
    context.logger.error('Failed to check authentication status')
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function handleGenerateCertificate(
  context: CliContext,
  options: {
    commonName: string
    organization?: string | undefined
    organizationalUnit?: string | undefined
    locality?: string | undefined
    state?: string | undefined
    country: string
    email?: string | undefined
    validDays: number
    keySize: number
    algorithm: string
    password?: string | undefined
    format: string
    outputCert?: string | undefined
    outputKey?: string | undefined
    outputP12?: string | undefined
  }
): Promise<CommandResult> {
  try {
    context.logger.info('Generating self-signed certificate...')

    // Validate algorithm
    if (options.algorithm !== 'RSA' && options.algorithm !== 'ECDSA') {
      throw new Error('Algorithm must be RSA or ECDSA')
    }

    // Validate country code
    if (options.country.length !== 2) {
      throw new Error('Country code must be exactly 2 letters (ISO 3166-1 alpha-2)')
    }

    // Validate format
    if (!['pkcs12', 'pem', 'both'].includes(options.format)) {
      throw new Error('Format must be pkcs12, pem, or both')
    }

    // Set default password for PKCS#12 if not provided
    const password = options.password ?? 'ksef-certificate'
    if (options.format !== 'pem' && !options.password) {
      context.logger.warn(`No password specified, using default: ${password}`)
    }

    // Build generation options
    const generationOptions: CertificateGenerationOptions = {
      commonName: options.commonName,
      organization: options.organization,
      organizationalUnit: options.organizationalUnit,
      locality: options.locality,
      state: options.state,
      country: options.country,
      emailAddress: options.email,
      validDays: options.validDays,
      keySize: options.keySize,
      algorithm: options.algorithm as 'RSA' | 'ECDSA',
      password,
    }

    context.logger.debug('Certificate generation options:', generationOptions)

    // Generate certificate
    const generator = new DefaultCertificateGenerator()
    const generatedCert = await generator.generateSelfSignedCertificate(generationOptions)

    context.logger.info('Certificate generated successfully')
    context.logger.info(`Subject: ${generatedCert.certificate.subject}`)
    context.logger.info(`Serial Number: ${generatedCert.certificate.serialNumber}`)
    context.logger.info(`Valid from: ${generatedCert.certificate.notBefore.toISOString()}`)
    context.logger.info(`Valid to: ${generatedCert.certificate.notAfter.toISOString()}`)
    context.logger.info(`Thumbprint: ${generatedCert.certificate.thumbprint}`)

    // Prepare file outputs (in a real implementation, we would write to actual files)
    const outputs: string[] = []

    if (options.format === 'pkcs12' || options.format === 'both') {
      const p12File = options.outputP12 ?? `${options.commonName.replace(/[^a-zA-Z0-9]/g, '_')}.p12`
      context.logger.info(`Would save PKCS#12 certificate to: ${p12File}`)
      context.logger.info(`PKCS#12 size: ${generatedCert.pkcs12Data.byteLength} bytes`)
      outputs.push(`PKCS#12: ${p12File}`)
    }

    if (options.format === 'pem' || options.format === 'both') {
      const certFile = options.outputCert ?? `${options.commonName.replace(/[^a-zA-Z0-9]/g, '_')}.crt`
      const keyFile = options.outputKey ?? `${options.commonName.replace(/[^a-zA-Z0-9]/g, '_')}.key`
      context.logger.info(`Would save PEM certificate to: ${certFile}`)
      context.logger.info(`Would save PEM private key to: ${keyFile}`)
      outputs.push(`Certificate: ${certFile}`)
      outputs.push(`Private Key: ${keyFile}`)
    }

    // Return certificate information
    const resultData = {
      certificate: {
        subject: generatedCert.certificate.subject,
        serialNumber: generatedCert.certificate.serialNumber,
        thumbprint: generatedCert.certificate.thumbprint,
        algorithm: generatedCert.certificate.algorithm,
        validFrom: generatedCert.certificate.notBefore.toISOString(),
        validTo: generatedCert.certificate.notAfter.toISOString(),
        keyUsage: generatedCert.certificate.keyUsage,
      },
      outputs,
      format: options.format,
      ...(options.format !== 'pem' && { password }),
    }

    context.logger.success('Certificate generation completed successfully')

    return {
      success: true,
      data: resultData,
      message: 'Self-signed certificate generated successfully',
    }
  } catch (error) {
    context.logger.error('Failed to generate certificate')
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function handleAuthWhoami(
  context: CliContext,
  options: { validate?: boolean }
): Promise<CommandResult> {
  try {
    const auth = context.config.auth
    if (!auth?.accessToken) {
      throw new Error('No stored auth token found. Run `ksef auth login` first.')
    }

    const payload = decodeJwtPayload(auth.accessToken)
    const expiresAt = new Date(auth.expiresAt)
    const isExpired = Number.isNaN(expiresAt.getTime()) ? undefined : Date.now() > expiresAt.getTime()

    let validation: { valid: boolean; message?: string; sessionCount?: number } | undefined
    if (options.validate !== false) {
      const client = await createKsefClient(context)
      try {
        const response = await client.httpClient.get<{ items?: unknown[] }>('/api/v2/auth/sessions')
        validation = {
          valid: true,
          sessionCount: response.data?.items?.length ?? 0,
        }
      } catch (error) {
        validation = {
          valid: false,
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }

    return {
      success: true,
      data: {
        expiresAt: auth.expiresAt,
        expired: isExpired,
        tokenPayload: payload,
        validation,
      },
      message: 'Auth token details retrieved',
    }
  } catch (error) {
    context.logger.error('Failed to read auth token')
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function handleAuthLogout(context: CliContext): Promise<CommandResult> {
  try {
    const configManager = new DefaultConfigManager()
    const updatedConfig = { ...context.config }
    delete updatedConfig.auth
    await configManager.saveConfig(updatedConfig, context.configFilePath)
    return {
      success: true,
      message: 'Auth tokens cleared',
    }
  } catch (error) {
    context.logger.error('Failed to clear auth tokens')
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function createKsefClient(context: CliContext): Promise<KsefClient> {
  const environment = (context.config.environment ?? 'test') as KsefEnvironment
  const baseURL = context.config.baseURL ?? getKsefBaseUrl(environment)

  const client = KsefClient.create({
    baseURL,
    environment,
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

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) {
    return null
  }

  const payload = parts[1]
  if (!payload) {
    return null
  }

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
    const decoded = Buffer.from(padded, 'base64').toString('utf-8')
    return JSON.parse(decoded) as Record<string, unknown>
  } catch {
    return null
  }
}
