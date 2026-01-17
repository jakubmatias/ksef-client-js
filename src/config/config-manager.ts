import { z } from 'zod'
import { CliConfig } from '@/cli/types'
import fs from 'fs'
import fsp from 'fs/promises'

// Configuration file schema
export const ConfigFileSchema = z.object({
  environment: z.enum(['test', 'demo', 'production']).optional(),
  baseURL: z.string().url().optional(),
  certificatePath: z.string().optional(),
  certificatePassword: z.string().optional(),
  timeout: z.number().positive().optional(),
  retries: z.number().int().min(0).max(10).optional(),
  rateLimit: z.number().positive().optional(),
  format: z.enum(['json', 'table', 'csv']).optional().default('table'),
  verbose: z.boolean().optional().default(false),
  silent: z.boolean().optional().default(false),
  auth: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    sessionToken: z.string(),
    expiresAt: z.string(),
    referenceNumber: z.string().optional(),
  }).optional(),
  sessions: z.record(z.string(), z.object({
    symmetricKey: z.string(),
    initializationVector: z.string(),
    schema: z.string().optional(),
  })).optional(),
  lastSessionId: z.string().optional(),
})

export type ConfigFile = z.infer<typeof ConfigFileSchema>

export interface ConfigManager {
  loadConfig(configPath?: string): Promise<ConfigFile>
  saveConfig(config: ConfigFile, configPath?: string): Promise<void>
  mergeConfig(baseConfig: ConfigFile, overrides: Partial<CliConfig>): ConfigFile
  getDefaultConfigPath(): string
  validateConfig(config: unknown): ConfigFile
}

export class DefaultConfigManager implements ConfigManager {
  // Configuration file paths in order of preference
  // private readonly defaultConfigPaths = [
  //   '.ksef.json',
  //   '.ksef.config.json',
  //   'ksef.config.json',
  // ]

  public async loadConfig(configPath?: string): Promise<ConfigFile> {
    const resolvedPath = configPath ?? this.findConfigFile()

    if (!resolvedPath) {
      return this.getDefaultConfig()
    }

    try {
      const raw = await fsp.readFile(resolvedPath, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      return this.validateConfig(parsed)
    } catch (error) {
      throw new Error(`Failed to load configuration from ${resolvedPath}: ${error}`)
    }
  }

  public async saveConfig(config: ConfigFile, configPath?: string): Promise<void> {
    const resolvedPath = configPath ?? this.getDefaultConfigPath()

    try {
      const validatedConfig = this.validateConfig(config)
      await fsp.writeFile(resolvedPath, JSON.stringify(validatedConfig, null, 2), 'utf-8')
    } catch (error) {
      throw new Error(`Failed to save configuration to ${resolvedPath}: ${error}`)
    }
  }

  public mergeConfig(baseConfig: ConfigFile, overrides: Partial<CliConfig>): ConfigFile {
    const merged = {
      ...baseConfig,
      ...overrides,
    }

    return this.validateConfig(merged)
  }

  public getDefaultConfigPath(): string {
    return '.ksef.json'
  }

  public validateConfig(config: unknown): ConfigFile {
    const result = ConfigFileSchema.safeParse(config)
    if (!result.success) {
      throw new Error(`Invalid configuration: ${result.error.message}`)
    }
    return result.data
  }

  private findConfigFile(): string | null {
    const candidate = this.getDefaultConfigPath()
    return fs.existsSync(candidate) ? candidate : null
  }

  private getDefaultConfig(): ConfigFile {
    return {
      environment: 'test',
      format: 'table',
      verbose: false,
      silent: false,
      timeout: 30000,
      retries: 3,
    }
  }
}

export class ConfigError extends Error {
  constructor(message: string, public readonly path?: string) {
    super(message)
    this.name = 'ConfigError'
  }
}
