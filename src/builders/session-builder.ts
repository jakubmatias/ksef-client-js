import {
  OnlineSessionConfig,
  BatchSessionConfig,
  OnlineSessionConfigSchema,
  BatchSessionConfigSchema,
  FormCode,
  EncryptionInfo,
} from '@/types/session'

export class OnlineSessionBuilder {
  private config: Partial<OnlineSessionConfig> = {}

  public withNip(nip: string): this {
    this.config.nip = nip
    return this
  }

  public withDescription(description: string): this {
    this.config.description = description
    return this
  }

  public withTimeout(timeoutSeconds: number): this {
    this.config.timeout = timeoutSeconds
    return this
  }

  public withFormCode(formCode: FormCode): this {
    this.config.formCode = formCode
    return this
  }

  public withEncryption(encryption: EncryptionInfo): this {
    this.config.encryption = encryption
    return this
  }

  public build(): OnlineSessionConfig {
    const result = OnlineSessionConfigSchema.safeParse(this.config)
    if (!result.success) {
      throw new Error(`Invalid online session configuration: ${result.error.message}`)
    }
    return result.data
  }

  public static create(): OnlineSessionBuilder {
    return new OnlineSessionBuilder()
  }

  public static forNip(nip: string): OnlineSessionBuilder {
    return new OnlineSessionBuilder().withNip(nip)
  }
}

export class BatchSessionBuilder {
  private config: Partial<BatchSessionConfig> = {}

  public withNip(nip: string): this {
    this.config.nip = nip
    return this
  }

  public withDescription(description: string): this {
    this.config.description = description
    return this
  }

  public withTimeout(timeoutSeconds: number): this {
    this.config.timeout = timeoutSeconds
    return this
  }

  public withMaxParts(maxParts: number): this {
    this.config.maxParts = maxParts
    return this
  }

  public withFormCode(formCode: FormCode): this {
    this.config.formCode = formCode
    return this
  }

  public withEncryption(encryption: EncryptionInfo): this {
    this.config.encryption = encryption
    return this
  }

  public build(): BatchSessionConfig {
    const result = BatchSessionConfigSchema.safeParse(this.config)
    if (!result.success) {
      throw new Error(`Invalid batch session configuration: ${result.error.message}`)
    }
    return result.data
  }

  public static create(): BatchSessionBuilder {
    return new BatchSessionBuilder()
  }

  public static forNip(nip: string): BatchSessionBuilder {
    return new BatchSessionBuilder().withNip(nip)
  }
}

// Generic session builder factory
export class SessionBuilder {
  public static online(): OnlineSessionBuilder {
    return OnlineSessionBuilder.create()
  }

  public static batch(): BatchSessionBuilder {
    return BatchSessionBuilder.create()
  }

  public static onlineForNip(nip: string): OnlineSessionBuilder {
    return OnlineSessionBuilder.forNip(nip)
  }

  public static batchForNip(nip: string): BatchSessionBuilder {
    return BatchSessionBuilder.forNip(nip)
  }
}
