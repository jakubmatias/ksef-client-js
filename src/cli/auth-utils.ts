import { CliContext } from './types'
import { KsefClient } from '@/index'
import { DefaultConfigManager } from '@/config/config-manager'
import { getKsefBaseUrl, KsefEnvironment } from '@/config/environment'

const REFRESH_SKEW_MS = 60 * 1000

export function attachAccessToken(context: CliContext, client: KsefClient): void {
  client.httpClient.addRequestInterceptor({
    onRequest: async (config) => {
      const accessToken = context.config.auth?.accessToken
      if (!accessToken) {
        return config
      }

      return {
        ...config,
        headers: {
          ...(config.headers || {}),
          Authorization: (config.headers || {}).Authorization ?? `Bearer ${accessToken}`,
        },
      }
    },
  })

  client.httpClient.addResponseInterceptor({
    onError: async (error) => {
      if (error.status !== 401) {
        return error
      }

      const auth = context.config.auth
      if (!auth?.refreshToken) {
        return error
      }

      const retryHeader = error.config.headers?.['x-ksef-retry'] || error.config.headers?.['X-KSEF-Retry']
      if (retryHeader) {
        return error
      }

      const refreshed = await client.authenticator.refreshToken(auth.refreshToken)
      const updatedAuth = {
        ...auth,
        accessToken: refreshed.accessToken,
        expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
      }

      context.config.auth = updatedAuth
      const configManager = new DefaultConfigManager()
      await configManager.saveConfig(context.config, context.configFilePath)

      const path = deriveRequestPath(context, error.response?.url)
      if (!path) {
        return error
      }

      const retryConfig = {
        ...error.config,
        headers: {
          ...(error.config.headers || {}),
          Authorization: `Bearer ${updatedAuth.accessToken}`,
          'x-ksef-retry': '1',
        },
      }

      return client.httpClient.request(path, retryConfig)
    },
  })
}

export async function refreshAccessTokenIfNeeded(
  context: CliContext,
  client: KsefClient
): Promise<void> {
  const auth = context.config.auth
  if (!auth?.refreshToken || !auth.expiresAt) {
    return
  }

  const expiresAt = new Date(auth.expiresAt)
  if (Number.isNaN(expiresAt.getTime())) {
    return
  }

  if (expiresAt.getTime() - Date.now() > REFRESH_SKEW_MS) {
    return
  }

  const refreshed = await client.authenticator.refreshToken(auth.refreshToken)
  const updatedAuth = {
    ...auth,
    accessToken: refreshed.accessToken,
    expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
  }

  context.config.auth = updatedAuth
  const configManager = new DefaultConfigManager()
  await configManager.saveConfig(context.config, context.configFilePath)
}

function deriveRequestPath(context: CliContext, responseUrl?: string): string | null {
  if (!responseUrl) {
    return null
  }

  const environment = (context.config.environment ?? 'test') as KsefEnvironment
  const baseURL = context.config.baseURL ?? getKsefBaseUrl(environment)

  if (!responseUrl.startsWith(baseURL)) {
    return null
  }

  const path = responseUrl.slice(baseURL.length)
  return path.startsWith('/') ? path : `/${path}`
}
