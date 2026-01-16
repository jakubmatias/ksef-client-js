import {
  AuthConfig,
  AuthConfigSchema,
  CertificateFormat,
  ContextIdentifier,
  SubjectIdentifierType,
  IpAddressPolicy,
  AuthMode,
} from '@/types/auth'

export class AuthConfigBuilder {
  private config: Partial<AuthConfig> = {}

  public withCertificatePath(path: string): this {
    this.config.certificatePath = path
    return this
  }

  public withCertificateData(data: Uint8Array): this {
    const buffer = data.buffer instanceof ArrayBuffer ? data.buffer : new ArrayBuffer(data.byteLength)
    this.config.certificateData = new Uint8Array(buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
    return this
  }

  public withCertificatePassword(password: string): this {
    this.config.certificatePassword = password
    return this
  }

  public withFormat(format: CertificateFormat): this {
    this.config.format = format
    return this
  }

  public withAlgorithm(algorithm: 'SHA256withRSA' | 'SHA256withECDSA'): this {
    this.config.algorithm = algorithm
    return this
  }

  public withCertificateValidation(validate: boolean): this {
    this.config.validateCertificate = validate
    return this
  }

  public withAuthMode(mode: AuthMode): this {
    this.config.authMode = mode
    return this
  }

  public withContextIdentifier(identifier: ContextIdentifier): this {
    this.config.contextIdentifier = identifier
    return this
  }

  public withSubjectIdentifierType(type: SubjectIdentifierType): this {
    this.config.subjectIdentifierType = type
    return this
  }

  public withIpAddressPolicy(policy: IpAddressPolicy): this {
    this.config.ipAddressPolicy = policy
    return this
  }

  public withVerifyCertificateChain(verify: boolean): this {
    this.config.verifyCertificateChain = verify
    return this
  }

  public withMockSignature(useMockSignature: boolean): this {
    this.config.useMockSignature = useMockSignature
    return this
  }

  public build(): AuthConfig {
    // Validate the configuration
    const result = AuthConfigSchema.safeParse(this.config)
    if (!result.success) {
      throw new Error(`Invalid authentication configuration: ${result.error.message}`)
    }

    // Ensure we have either certificate path or data
    if (!this.config.certificatePath && !this.config.certificateData) {
      throw new Error('Either certificatePath or certificateData must be provided')
    }

    return result.data
  }

  public static create(): AuthConfigBuilder {
    return new AuthConfigBuilder()
  }
}
