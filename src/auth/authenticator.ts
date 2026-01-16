import {
  AuthConfig,
  AuthChallenge,
  AccessTokenResponse,
  AuthResult,
  AuthenticationError,
  CertificateInfo,
  AuthenticationInitResponse,
  AuthenticationOperationStatusResponse,
  AuthenticationTokensResponse,
  AuthenticationTokenRefreshResponse,
  TokenInfo,
} from '@/types/auth'
import { CertificateManager, DefaultCertificateManager } from './certificate-manager'
import { HttpClient } from '@/http/http-client'
import { buildAuthTokenRequestXml } from './auth-token-request'
import { signXmlWithXades } from './xades-signature-service'
import { HttpError } from '@/types/http'

export interface Authenticator {
  authenticate(config: AuthConfig): Promise<AuthResult>
  refreshToken(refreshToken: string): Promise<AccessTokenResponse>
  revokeToken(token: string): Promise<void>
}

export class DefaultAuthenticator implements Authenticator {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly certificateManager: CertificateManager = new DefaultCertificateManager()
  ) {}

  public async authenticate(config: AuthConfig): Promise<AuthResult> {
    try {
      const certificateInfo = await this.loadCertificate(config)

      if (config.validateCertificate && !(await this.certificateManager.validateCertificate(certificateInfo))) {
        throw new AuthenticationError('Certificate validation failed', 'CERTIFICATE_INVALID')
      }

      if (config.authMode === 'legacy' || config.useMockSignature) {
        return await this.authenticateLegacy(config, certificateInfo)
      }

      const challenge = await this.getAuthChallengeV2()
      const signedXml = await this.buildAndSignXadesRequest(config, challenge)
      this.maybeDumpSignedXml(signedXml)
      const initResponse = await this.submitXadesTokenRequest(signedXml, config.verifyCertificateChain)

      await this.checkAuthStatusV2(initResponse.referenceNumber, initResponse.authenticationToken.token)
      const redeemResponse = await this.redeemTokensV2(initResponse.authenticationToken.token)

      return {
        accessToken: redeemResponse.accessToken,
        refreshToken: redeemResponse.refreshToken,
        expiresIn: redeemResponse.expiresIn,
        expiresAt: new Date(Date.now() + redeemResponse.expiresIn * 1000),
        sessionToken: initResponse.authenticationToken.token,
        referenceNumber: initResponse.referenceNumber,
        certificateInfo,
      }
    } catch (error) {
      this.logAuthDebug('authenticate', error)
      if (error instanceof AuthenticationError) {
        throw error
      }
      throw new AuthenticationError(
        'Authentication failed',
        'AUTH_FAILED',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  public async refreshToken(refreshToken: string): Promise<AccessTokenResponse> {
    try {
      const response = await this.httpClient.post<AuthenticationTokenRefreshResponse>(
        '/api/v2/auth/token/refresh',
        {
          headers: {
            Authorization: `Bearer ${refreshToken}`,
          },
        }
      )

      if (!response.data) {
        throw new AuthenticationError('Empty response from refresh endpoint', 'EMPTY_RESPONSE')
      }

      return this.mapAccessTokenResponse(response.data.accessToken)
    } catch (error) {
      this.logAuthDebug('refreshToken', error)
      throw new AuthenticationError(
        'Token refresh failed',
        'REFRESH_FAILED',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  public async revokeToken(token: string): Promise<void> {
    try {
      await this.httpClient.delete('/api/v2/auth/token', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    } catch (error) {
      this.logAuthDebug('revokeToken', error)
      throw new AuthenticationError(
        'Token revocation failed',
        'REVOKE_FAILED',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private async authenticateLegacy(config: AuthConfig, certificateInfo: CertificateInfo): Promise<AuthResult> {
    const challenge = await this.getAuthChallenge()
    const signedChallenge = await this.signChallengeLegacy(challenge, config.algorithm!)
    const tokenResponse = await this.submitTokenRequestLegacy({
      certificateThumbprint: this.certificateManager.getCertificateThumbprint(),
      signedChallenge,
      algorithm: config.algorithm!,
    })

    await this.checkAuthStatusLegacy(tokenResponse.referenceNumber)
      const accessTokenResponse = await this.redeemTokensLegacy(tokenResponse.sessionToken)

      return {
        accessToken: accessTokenResponse.accessToken,
        refreshToken: accessTokenResponse.refreshToken,
        expiresIn: accessTokenResponse.expiresIn,
        expiresAt: new Date(Date.now() + accessTokenResponse.expiresIn * 1000),
        sessionToken: tokenResponse.sessionToken,
        referenceNumber: tokenResponse.referenceNumber,
        certificateInfo,
      }
  }

  private async loadCertificate(config: AuthConfig): Promise<CertificateInfo> {
    if (config.certificateData) {
      return this.certificateManager.loadCertificate(
        config.certificateData,
        config.certificatePassword,
        config.format
      )
    }

    if (config.certificatePath) {
      return this.certificateManager.loadCertificateFromPath(
        config.certificatePath,
        config.certificatePassword
      )
    }

    throw new AuthenticationError('No certificate data or path provided', 'NO_CERTIFICATE')
  }

  private async getAuthChallengeV2(): Promise<AuthChallenge> {
    try {
      const response = await this.httpClient.post<AuthChallenge>('/api/v2/auth/challenge')

      if (!response.data) {
        throw new AuthenticationError('Empty challenge response', 'EMPTY_CHALLENGE')
      }

      return response.data
    } catch (error) {
      this.logAuthDebug('getAuthChallengeV2', error)
      throw new AuthenticationError(
        'Failed to get authentication challenge',
        'CHALLENGE_FAILED',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private async buildAndSignXadesRequest(config: AuthConfig, challenge: AuthChallenge): Promise<string> {
    try {
      if (!config.contextIdentifier) {
        throw new AuthenticationError('Context identifier is required for XAdES auth', 'MISSING_CONTEXT')
      }

      const xml = buildAuthTokenRequestXml({
        challenge: challenge.challenge,
        contextIdentifier: config.contextIdentifier,
        subjectIdentifierType: config.subjectIdentifierType ?? 'certificateSubject',
        ...(config.ipAddressPolicy ? { ipAddressPolicy: config.ipAddressPolicy } : {}),
      })

      if (config.useMockSignature) {
        return xml.replace(
          '</AuthTokenRequest>',
          '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="Signature-mock"></ds:Signature>\n</AuthTokenRequest>'
        )
      }

      return await signXmlWithXades(
        xml,
        this.certificateManager.getCertificatePem(),
        this.certificateManager.getPrivateKeyPem(),
        config.certificatePassword
      )
    } catch (error) {
      this.logAuthDebug('buildAndSignXadesRequest', error)
      throw new AuthenticationError(
        'Failed to sign AuthTokenRequest',
        'SIGN_FAILED',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private maybeDumpSignedXml(xml: string): void {
    if (process.env['KSEF_DEBUG_AUTH_XML'] !== '1' && process.env['KSEF_DEBUG_AUTH_XML'] !== 'true') {
      return
    }
    try {
      const fs = require('fs') as typeof import('fs')
      const path = require('path') as typeof import('path')
      const outPath = path.resolve(process.cwd(), 'ksef-auth-signed.xml')
      fs.writeFileSync(outPath, xml)
      console.log(`🧾 Wrote signed AuthTokenRequest to ${outPath}`)
    } catch (error) {
      console.error('Failed to write signed XML for debug', error)
    }
  }

  private async submitXadesTokenRequest(
    signedXml: string,
    verifyCertificateChain = false
  ): Promise<AuthenticationInitResponse> {
    try {
      const response = await this.httpClient.post<AuthenticationInitResponse>(
        `/api/v2/auth/xades-signature?verifyCertificateChain=${verifyCertificateChain ? 'true' : 'false'}`,
        {
          headers: {
            'Content-Type': 'application/xml',
          },
          body: signedXml,
        }
      )

      if (!response.data) {
        throw new AuthenticationError('Empty token response', 'EMPTY_TOKEN_RESPONSE')
      }

      return response.data
    } catch (error) {
      this.logAuthDebug('submitXadesTokenRequest', error)
      throw new AuthenticationError(
        'Token request failed',
        'TOKEN_REQUEST_FAILED',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private async checkAuthStatusV2(
    referenceNumber: string,
    authenticationToken: string
  ): Promise<AuthenticationOperationStatusResponse> {
    try {
      const response = await this.httpClient.get<AuthenticationOperationStatusResponse>(
        `/api/v2/auth/${referenceNumber}`,
        {
          headers: {
            Authorization: `Bearer ${authenticationToken}`,
          },
        }
      )

      if (!response.data) {
        throw new AuthenticationError('Empty status response', 'EMPTY_STATUS_RESPONSE')
      }

      if (response.data.status.code !== 200) {
        throw new AuthenticationError(
          `Authentication failed: ${response.data.status.description}`,
          'AUTH_PROCESSING_FAILED',
          response.data
        )
      }

      return response.data
    } catch (error) {
      this.logAuthDebug('checkAuthStatusV2', error)
      if (error instanceof AuthenticationError) {
        throw error
      }
      throw new AuthenticationError(
        'Status check failed',
        'STATUS_CHECK_FAILED',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private async redeemTokensV2(authenticationToken: string): Promise<AccessTokenResponse> {
    try {
      const response = await this.httpClient.post<AuthenticationTokensResponse>(
        '/api/v2/auth/token/redeem',
        {
          headers: {
            Authorization: `Bearer ${authenticationToken}`,
          },
        }
      )

      if (!response.data) {
        throw new AuthenticationError('Empty redeem response', 'EMPTY_REDEEM_RESPONSE')
      }

      const accessToken = this.mapAccessTokenResponse(response.data.accessToken)
      const refreshToken = this.mapAccessTokenResponse(response.data.refreshToken)

      return {
        accessToken: accessToken.accessToken,
        refreshToken: refreshToken.accessToken,
        expiresIn: accessToken.expiresIn,
        tokenType: 'Bearer',
      }
    } catch (error) {
      this.logAuthDebug('redeemTokensV2', error)
      throw new AuthenticationError(
        'Token redeem failed',
        'REDEEM_FAILED',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private mapAccessTokenResponse(tokenInfo: TokenInfo): AccessTokenResponse {
    const validUntil = new Date(tokenInfo.validUntil)
    const expiresIn = Math.max(0, Math.floor((validUntil.getTime() - Date.now()) / 1000))
    return {
      accessToken: tokenInfo.token,
      refreshToken: '',
      expiresIn,
      tokenType: 'Bearer',
    }
  }

  private async getAuthChallengeLegacy(): Promise<AuthChallenge> {
    try {
      const response = await this.httpClient.get<AuthChallenge>('/auth/challenge')

      if (!response.data) {
        throw new AuthenticationError('Empty challenge response', 'EMPTY_CHALLENGE')
      }

      return response.data
    } catch (error) {
      this.logAuthDebug('getAuthChallengeLegacy', error)
      throw new AuthenticationError(
        'Failed to get authentication challenge',
        'CHALLENGE_FAILED',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private async getAuthChallenge(): Promise<AuthChallenge> {
    return this.getAuthChallengeLegacy()
  }

  private async signChallengeLegacy(challenge: AuthChallenge, algorithm: string): Promise<string> {
    try {
      const challengeData = new TextEncoder().encode(`${challenge.challenge}:${challenge.timestamp}`)
      const signature = await this.certificateManager.signData(challengeData, algorithm)
      return btoa(String.fromCharCode(...signature))
    } catch (error) {
      this.logAuthDebug('signChallengeLegacy', error)
      throw new AuthenticationError(
        'Failed to sign challenge',
        'SIGN_FAILED',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private async submitTokenRequestLegacy(request: {
    certificateThumbprint: string
    signedChallenge: string
    algorithm: string
  }): Promise<{ sessionToken: string; referenceNumber: string; timestamp: string }> {
    try {
      const response = await this.httpClient.post<{ sessionToken: string; referenceNumber: string; timestamp: string }>(
        '/auth/token',
        {
          body: request,
        }
      )

      if (!response.data) {
        throw new AuthenticationError('Empty token response', 'EMPTY_TOKEN_RESPONSE')
      }

      return response.data
    } catch (error) {
      this.logAuthDebug('submitTokenRequestLegacy', error)
      throw new AuthenticationError(
        'Token request failed',
        'TOKEN_REQUEST_FAILED',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private async checkAuthStatusLegacy(referenceNumber: string): Promise<{ processingCode: number; processingDescription: string }> {
    try {
      const response = await this.httpClient.get<{ processingCode: number; processingDescription: string }>(
        `/auth/status/${referenceNumber}`
      )

      if (!response.data) {
        throw new AuthenticationError('Empty status response', 'EMPTY_STATUS_RESPONSE')
      }

      if (response.data.processingCode !== 200) {
        throw new AuthenticationError(
          `Authentication failed: ${response.data.processingDescription}`,
          'AUTH_PROCESSING_FAILED',
          response.data
        )
      }

      return response.data
    } catch (error) {
      this.logAuthDebug('checkAuthStatusLegacy', error)
      if (error instanceof AuthenticationError) {
        throw error
      }
      throw new AuthenticationError(
        'Status check failed',
        'STATUS_CHECK_FAILED',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private async redeemTokensLegacy(sessionToken: string): Promise<AccessTokenResponse> {
    try {
      const response = await this.httpClient.post<AccessTokenResponse>('/auth/redeem', {
        body: { sessionToken },
      })

      if (!response.data) {
        throw new AuthenticationError('Empty redeem response', 'EMPTY_REDEEM_RESPONSE')
      }

      return response.data
    } catch (error) {
      this.logAuthDebug('redeemTokensLegacy', error)
      throw new AuthenticationError(
        'Token redemption failed',
        'REDEEM_FAILED',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private logAuthDebug(context: string, error: unknown): void {
    if (!this.isDebugEnabled()) {
      return
    }

    if (error instanceof HttpError) {
      const responseData = error.response?.data as {
        exception?: { exceptionDetailList?: unknown }
      } | undefined
      const exceptionDetails = responseData?.exception?.exceptionDetailList

      const exceptionDetailsJson = Array.isArray(exceptionDetails)
        ? JSON.stringify(exceptionDetails, null, 2)
        : undefined
      console.error(`[ksef-auth-debug] ${context}`, {
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        url: error.response?.url,
        response: error.response?.data,
        exceptionDetails,
        exceptionDetailsJson,
      })
      return
    }

    console.error(`[ksef-auth-debug] ${context}`, error)
  }

  private isDebugEnabled(): boolean {
    return process.env['KSEF_DEBUG_AUTH'] === 'true' || process.env['KSEF_DEBUG_AUTH'] === '1'
  }
}
