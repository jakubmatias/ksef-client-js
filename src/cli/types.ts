export interface CliConfig {
  baseURL?: string | undefined
  environment?: 'test' | 'demo' | 'production' | undefined
  certificatePath?: string | undefined
  certificatePassword?: string | undefined
  configFile?: string | undefined
  verbose?: boolean | undefined
  silent?: boolean | undefined
  format?: 'json' | 'table' | 'csv' | undefined
  timeout?: number | undefined
  auth?: {
    accessToken: string
    refreshToken: string
    sessionToken: string
    expiresAt: string
    referenceNumber?: string
  }
  sessions?: Record<string, {
    symmetricKey: string
    initializationVector: string
  }>
  lastSessionId?: string
}

export interface CliContext {
  config: CliConfig
  logger: Logger
  configFilePath?: string | undefined
}

export interface Logger {
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
  debug(message: string, ...args: unknown[]): void
  success(message: string, ...args: unknown[]): void
}

export interface CommandResult {
  success: boolean
  data?: unknown
  message?: string
  error?: string
}

export interface PipelineData {
  invoices?: unknown[]
  sessions?: unknown[]
  certificates?: unknown[]
  [key: string]: unknown
}
