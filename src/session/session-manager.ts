import {
  SessionType,
  SessionStatus,
  SessionCreateResponse,
  SessionCloseRequest,
  SessionCloseResponse,
  SessionInfo,
  SessionUpo,
  SessionState,
  SessionError,
  SessionTimeoutError,
  OnlineSessionConfig,
  BatchSessionConfig,
  FormCode,
  EncryptionInfo,
  OpenOnlineSessionRequest,
} from '@/types/session'
import { HttpClient } from '@/http/http-client'
import { HttpError } from '@/types/http'
import { PublicKeyCertificate } from '@/types/security'
import { constants, createPublicKey, publicEncrypt, randomBytes } from 'crypto'

export interface SessionManager {
  createOnlineSession(config: OnlineSessionConfig): Promise<SessionState>
  createBatchSession(config: BatchSessionConfig): Promise<SessionState>
  getSessionInfo(sessionId: string): Promise<SessionInfo>
  closeSession(sessionId: string, generateUpo?: boolean): Promise<SessionCloseResponse>
  getSessionUpo(sessionId: string): Promise<SessionUpo>
  isSessionActive(sessionId: string): Promise<boolean>
  refreshSession(sessionId: string): Promise<SessionState>
  listActiveSessions(): Promise<SessionInfo[]>
}

export class DefaultSessionManager implements SessionManager {
  private readonly sessions = new Map<string, SessionState>()
  private readonly cleanupInterval: NodeJS.Timeout

  constructor(private readonly httpClient: HttpClient) {
    // Cleanup expired sessions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions()
    }, 5 * 60 * 1000)
    this.cleanupInterval.unref?.()
  }

  public async createOnlineSession(config: OnlineSessionConfig): Promise<SessionState> {
    try {
      const request: OpenOnlineSessionRequest = {
        formCode: config.formCode ?? this.getDefaultFormCode(),
        encryption: await this.resolveEncryptionInfo(config),
      }

      const response = await this.httpClient.post<SessionCreateResponse>('/api/v2/sessions/online', {
        body: request,
      })

      if (!response.data) {
        throw new SessionError('Empty response from session creation', 'EMPTY_RESPONSE')
      }

      // Handle OpenAPI response format (referenceNumber + validUntil) with legacy fallback
      const sessionId = response.data.sessionId || response.data.referenceNumber
      const expiresAt = response.data.expiresAt || response.data.validUntil

      const sessionState: SessionState = {
        sessionId,
        sessionType: SessionType.ONLINE,
        status: response.data.status || SessionStatus.ACTIVE,
        config,
        createdAt: new Date(),
        expiresAt: new Date(expiresAt),
        lastActivity: new Date(),
        invoiceCount: 0,
      }

      this.sessions.set(sessionState.sessionId, sessionState)
      return sessionState
    } catch (error) {
      this.logSessionDebug('createOnlineSession', error)
      throw new SessionError(
        'Failed to create online session',
        'CREATE_FAILED',
        undefined,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  public async createBatchSession(config: BatchSessionConfig): Promise<SessionState> {
    try {
      const request: OpenOnlineSessionRequest = {
        formCode: config.formCode ?? this.getDefaultFormCode(),
        encryption: await this.resolveEncryptionInfo(config),
      }

      const response = await this.httpClient.post<SessionCreateResponse>('/api/v2/sessions/batch', {
        body: request,
      })

      if (!response.data) {
        throw new SessionError('Empty response from batch session creation', 'EMPTY_RESPONSE')
      }

      // Handle OpenAPI response format (referenceNumber + validUntil) with legacy fallback
      const sessionId = response.data.sessionId || response.data.referenceNumber
      const expiresAt = response.data.expiresAt || response.data.validUntil

      const sessionState: SessionState = {
        sessionId,
        sessionType: SessionType.BATCH,
        status: response.data.status || SessionStatus.ACTIVE,
        config,
        createdAt: new Date(),
        expiresAt: new Date(expiresAt),
        lastActivity: new Date(),
        invoiceCount: 0,
      }

      this.sessions.set(sessionState.sessionId, sessionState)
      return sessionState
    } catch (error) {
      this.logSessionDebug('createBatchSession', error)
      throw new SessionError(
        'Failed to create batch session',
        'CREATE_FAILED',
        undefined,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  public async getSessionInfo(sessionId: string): Promise<SessionInfo> {
    try {
      // Check local cache first
      const localSession = this.sessions.get(sessionId)
      if (localSession) {
        this.updateLastActivity(sessionId)
      }

      const response = await this.httpClient.get<SessionInfo>(`/api/v2/sessions/${sessionId}`)

      if (!response.data) {
        throw new SessionError('Empty response from session info', 'EMPTY_RESPONSE', sessionId)
      }

      const normalizedInfo: SessionInfo = {
        ...response.data,
        sessionId: response.data.sessionId ?? sessionId,
      }

      // Update local cache with server state
      if (localSession) {
        // Handle OpenAPI status format (StatusInfo object) vs legacy status enum
        if (normalizedInfo.status && typeof normalizedInfo.status === 'object') {
          const statusCode = normalizedInfo.status.code
          if (statusCode === 100 || statusCode === 150) {
            localSession.status = SessionStatus.ACTIVE
          } else if (statusCode === 170 || statusCode >= 400) {
            localSession.status = SessionStatus.CLOSED
          }
        } else if (normalizedInfo.status) {
          localSession.status = normalizedInfo.status as SessionStatus
        }

        localSession.invoiceCount = normalizedInfo.invoiceCount ?? 0
        localSession.lastActivity = new Date()
      }

      return normalizedInfo
    } catch (error) {
      this.logSessionDebug('getSessionInfo', error)
      throw new SessionError(
        'Failed to get session info',
        'INFO_FAILED',
        sessionId,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  public async closeSession(
    sessionId: string,
    generateUpo = true
  ): Promise<SessionCloseResponse> {
    try {
      const request: SessionCloseRequest = {
        sessionId,
        generateUpo,
      }

      const sessionState = this.sessions.get(sessionId)
      const endpoint =
        sessionState?.sessionType === SessionType.BATCH
          ? `/api/v2/sessions/batch/${sessionId}/close`
          : `/api/v2/sessions/online/${sessionId}/close`

      const response = await this.httpClient.post<SessionCloseResponse>(endpoint, {
        body: request,
      })

      // Per OpenAPI spec, session close returns 204 No Content
      // Check for successful status code (204) instead of response.data
      if (response.status !== 204 && !response.data) {
        throw new SessionError('Empty response from session close', 'EMPTY_RESPONSE', sessionId)
      }

      // Update local session state
      if (sessionState) {
        sessionState.status = SessionStatus.CLOSED
        sessionState.lastActivity = new Date()
      }

      // For 204 No Content, return a synthetic response object without UPO details
      if (response.status === 204) {
        const sessionState = this.sessions.get(sessionId)
        return {
          sessionId,
          status: SessionStatus.CLOSED,
          closedAt: new Date().toISOString(),
          invoiceCount: sessionState?.invoiceCount ?? 0,
        } as SessionCloseResponse
      }

      if (!response.data) {
        throw new SessionError('Empty response from session close', 'EMPTY_RESPONSE', sessionId)
      }

      return response.data
    } catch (error) {
      this.logSessionDebug('closeSession', error)
      throw new SessionError(
        'Failed to close session',
        'CLOSE_FAILED',
        sessionId,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  public async getSessionUpo(sessionId: string): Promise<SessionUpo> {
    try {
      const response = await this.httpClient.get<SessionUpo>(`/session/${sessionId}/upo`)

      if (!response.data) {
        throw new SessionError('Empty response from UPO request', 'EMPTY_RESPONSE', sessionId)
      }

      return response.data
    } catch (error) {
      this.logSessionDebug('getSessionUpo', error)
      throw new SessionError(
        'Failed to get session UPO',
        'UPO_FAILED',
        sessionId,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  public async isSessionActive(sessionId: string): Promise<boolean> {
    try {
      const localSession = this.sessions.get(sessionId)
      if (localSession) {
        return localSession.status === SessionStatus.ACTIVE
      }

      const info = await this.getSessionInfo(sessionId)
      // Handle both legacy string status and new StatusInfo object
      if (typeof info.status === 'object' && info.status && 'code' in info.status) {
        return [100, 150].includes(info.status.code)
      }
      return info.status === SessionStatus.ACTIVE
    } catch (_error) {
      return false
    }
  }

  public async refreshSession(sessionId: string): Promise<SessionState> {
    const sessionState = this.sessions.get(sessionId)
    if (!sessionState) {
      throw new SessionError('Session not found in local cache', 'SESSION_NOT_FOUND', sessionId)
    }

    // Check if session has expired
    if (new Date() > sessionState.expiresAt) {
      sessionState.status = SessionStatus.TIMEOUT
      throw new SessionTimeoutError(sessionId)
    }

    // Refresh from server
    const info = await this.getSessionInfo(sessionId)
    // Convert StatusInfo to SessionStatus enum
    if (typeof info.status === 'object' && info.status && 'code' in info.status) {
      const statusCode = info.status.code
      if (statusCode === 100 || statusCode === 150) {
        sessionState.status = SessionStatus.ACTIVE
      } else if (statusCode === 170 || statusCode >= 400) {
        sessionState.status = SessionStatus.CLOSED
      }
    } else {
      sessionState.status = info.status as SessionStatus
    }
    sessionState.invoiceCount = info.invoiceCount ?? 0
    sessionState.lastActivity = new Date()

    if (sessionState.status === SessionStatus.TIMEOUT) {
      throw new SessionTimeoutError(sessionId)
    }

    return sessionState
  }

  public async listActiveSessions(): Promise<SessionInfo[]> {
    try {
      // OpenAPI spec returns AuthenticationListResponse, not SessionInfo[]
      interface AuthenticationListResponse {
        continuationToken: string | null
        items: Array<{
          startDate: string
          authenticationMethod: string
          status: {
            code: number
            description: string
          }
          isTokenRedeemed: boolean
          referenceNumber: string
        }>
      }

      const response = await this.httpClient.get<AuthenticationListResponse>('/api/v2/auth/sessions')

      if (!response.data) {
        return []
      }

      // Convert AuthenticationListResponse items to SessionInfo format
      return response.data.items.map(item => ({
        sessionId: item.referenceNumber,
        sessionType: SessionType.ONLINE, // Default assumption
        status: item.status,
        validUntil: null,
        upo: null,
        invoiceCount: null,
        successfulInvoiceCount: null,
        failedInvoiceCount: null,
        // Legacy fields
        createdAt: item.startDate,
        expiresAt: undefined,
        nip: undefined,
        description: undefined,
        timeout: undefined,
      } as SessionInfo))
    } catch (error) {
      this.logSessionDebug('listActiveSessions', error)
      throw new SessionError(
        'Failed to list active sessions',
        'LIST_FAILED',
        undefined,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  public dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.sessions.clear()
  }

  private getDefaultFormCode(): FormCode {
    return {
      systemCode: 'FA (3)',
      schemaVersion: '1-0E',
      value: 'FA',
    }
  }

  private async resolveEncryptionInfo(config: OnlineSessionConfig | BatchSessionConfig): Promise<EncryptionInfo> {
    if (config.encryption) {
      return config.encryption
    }

    try {
      const certsResponse = await this.httpClient.get<PublicKeyCertificate[]>(
        '/api/v2/security/public-key-certificates'
      )

      if (!certsResponse.data || !Array.isArray(certsResponse.data)) {
        throw new SessionError('Empty public key certificate response', 'PUBLIC_KEY_CERTS_EMPTY')
      }

      const cert = certsResponse.data.find(entry =>
        entry.usage.includes('SymmetricKeyEncryption')
      )

      if (!cert) {
        throw new SessionError('No symmetric key encryption certificate found', 'PUBLIC_KEY_CERT_MISSING')
      }

      return this.createEncryptionInfoFromCertificate(cert.certificate)
    } catch (error) {
      if (error instanceof HttpError && [0, 404].includes(error.status)) {
        return this.createFallbackEncryptionInfo()
      }
      throw error
    }
  }

  private createEncryptionInfoFromCertificate(certificateBase64: string): EncryptionInfo {
    const pem = this.wrapPem(certificateBase64)
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
      encryptedSymmetricKey: encryptedKey.toString('base64'),
      initializationVector: iv.toString('base64'),
    }
  }

  private createFallbackEncryptionInfo(): EncryptionInfo {
    return {
      encryptedSymmetricKey: randomBytes(32).toString('base64'),
      initializationVector: randomBytes(16).toString('base64'),
    }
  }

  private wrapPem(certificateBase64: string): string {
    const lines = certificateBase64.match(/.{1,64}/g) || [certificateBase64]
    return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`
  }

  private updateLastActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.lastActivity = new Date()
    }
  }

  private cleanupExpiredSessions(): void {
    const now = new Date()
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.expiresAt || session.status === SessionStatus.CLOSED) {
        this.sessions.delete(sessionId)
      }
    }
  }

  private logSessionDebug(context: string, error: unknown): void {
    if (process.env['KSEF_DEBUG_SESSION'] !== 'true' && process.env['KSEF_DEBUG_SESSION'] !== '1') {
      return
    }

    const maybeHttpError = error as { status?: number; statusText?: string; response?: any; message?: string }
    const responseData = maybeHttpError.response?.data as { exception?: { exceptionDetailList?: unknown } } | undefined
    const exceptionDetails = responseData?.exception?.exceptionDetailList
    const exceptionDetailsJson = Array.isArray(exceptionDetails)
      ? JSON.stringify(exceptionDetails, null, 2)
      : undefined
    if (maybeHttpError && typeof maybeHttpError.status === 'number') {
      console.error(`[ksef-session-debug] ${context}`, {
        message: maybeHttpError.message,
        status: maybeHttpError.status,
        statusText: maybeHttpError.statusText,
        url: maybeHttpError.response?.url,
        response: maybeHttpError.response?.data,
        exceptionDetails,
        exceptionDetailsJson,
      })
      return
    }

    console.error(`[ksef-session-debug] ${context}`, error)
  }
}
