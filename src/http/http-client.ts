import {
  HttpMethod,
  HttpRequestConfig,
  HttpResponse,
  HttpError,
  HttpClientConfig,
  RequestInterceptor,
  ResponseInterceptor,
  RateLimiter,
  HttpRequestConfigSchema,
  HttpClientConfigSchema,
} from '@/types/http'
import { TokenBucketRateLimiter, NoOpRateLimiter } from './rate-limiter'

export interface HttpClient {
  get<T = unknown>(url: string, config?: Partial<HttpRequestConfig>): Promise<HttpResponse<T>>
  post<T = unknown>(url: string, config?: Partial<HttpRequestConfig>): Promise<HttpResponse<T>>
  put<T = unknown>(url: string, config?: Partial<HttpRequestConfig>): Promise<HttpResponse<T>>
  delete<T = unknown>(url: string, config?: Partial<HttpRequestConfig>): Promise<HttpResponse<T>>
  patch<T = unknown>(url: string, config?: Partial<HttpRequestConfig>): Promise<HttpResponse<T>>
  request<T = unknown>(url: string, config: HttpRequestConfig): Promise<HttpResponse<T>>
  addRequestInterceptor(interceptor: RequestInterceptor): void
  addResponseInterceptor(interceptor: ResponseInterceptor): void
}

export class DefaultHttpClient implements HttpClient {
  private readonly config: HttpClientConfig
  private readonly rateLimiter: RateLimiter
  private readonly requestInterceptors: RequestInterceptor[] = []
  private readonly responseInterceptors: ResponseInterceptor[] = []

  constructor(config: HttpClientConfig) {
    this.config = HttpClientConfigSchema.parse(config)
    this.rateLimiter = config.rateLimit
      ? new TokenBucketRateLimiter(config.rateLimit)
      : new NoOpRateLimiter()
  }

  public async get<T = unknown>(
    url: string,
    config?: Partial<HttpRequestConfig>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...config, method: HttpMethod.GET })
  }

  public async post<T = unknown>(
    url: string,
    config?: Partial<HttpRequestConfig>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...config, method: HttpMethod.POST })
  }

  public async put<T = unknown>(
    url: string,
    config?: Partial<HttpRequestConfig>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...config, method: HttpMethod.PUT })
  }

  public async delete<T = unknown>(
    url: string,
    config?: Partial<HttpRequestConfig>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...config, method: HttpMethod.DELETE })
  }

  public async patch<T = unknown>(
    url: string,
    config?: Partial<HttpRequestConfig>
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...config, method: HttpMethod.PATCH })
  }

  public async request<T = unknown>(
    url: string,
    config: Partial<HttpRequestConfig>
  ): Promise<HttpResponse<T>> {
    // Validate and merge configuration
    let requestConfig = HttpRequestConfigSchema.parse({
      ...config,
      headers: { ...this.config.headers, ...config.headers },
      timeout: config.timeout ?? this.config.timeout,
      retries: config.retries ?? this.config.retries,
      retryDelay: config.retryDelay ?? this.config.retryDelay,
    })

    // Apply request interceptors
    for (const interceptor of this.requestInterceptors) {
      if (interceptor.onRequest) {
        try {
          requestConfig = await interceptor.onRequest(requestConfig)
        } catch (error) {
          if (interceptor.onError) {
            await interceptor.onError(error instanceof Error ? error : new Error(String(error)))
          }
          throw error
        }
      }
    }

    // Build full URL
    const fullUrl = this.buildUrl(url)

    // Apply rate limiting
    await this.rateLimiter.waitForSlot()

    // Execute request with retries
    return this.executeWithRetries<T>(fullUrl, requestConfig)
  }

  public addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor)
  }

  public addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor)
  }

  private async executeWithRetries<T>(
    url: string,
    config: HttpRequestConfig,
    attempt = 1
  ): Promise<HttpResponse<T>> {
    try {
      return await this.executeRequest<T>(url, config)
    } catch (error) {
      if (
        error instanceof HttpError &&
        attempt <= config.retries! &&
        this.shouldRetry(error.status)
      ) {
        await this.delay(config.retryDelay! * attempt)
        return this.executeWithRetries<T>(url, config, attempt + 1)
      }
      throw error
    }
  }

  private async executeRequest<T>(url: string, config: HttpRequestConfig): Promise<HttpResponse<T>> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), config.timeout)

    try {
      const requestHeaders = { ...(config.headers || {}) }
      const body = config.body ? this.serializeBody(config.body, requestHeaders) : null

      const requestInit: RequestInit = {
        method: config.method,
        headers: this.buildHeaders(requestHeaders),
        body,
        signal: controller.signal,
      }

      const response = await fetch(url, requestInit)
      clearTimeout(timeoutId)

      const responseData = await this.deserializeResponse<T>(response)
      const headers = this.extractHeaders(response)

      const httpResponse: HttpResponse<T> = {
        data: responseData,
        status: response.status,
        statusText: response.statusText,
        headers,
        url,
        config,
      }

      if (!response.ok) {
        throw new HttpError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          response.statusText,
          config,
          httpResponse
        )
      }

      // Apply response interceptors
      let finalResponse = httpResponse
      for (const interceptor of this.responseInterceptors) {
        if (interceptor.onResponse) {
          finalResponse = await interceptor.onResponse(finalResponse)
        }
      }

      return finalResponse
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof HttpError) {
        // Apply response error interceptors
        let finalError = error
        for (const interceptor of this.responseInterceptors) {
          if (interceptor.onError) {
            const result = await interceptor.onError(finalError)
            if (this.isHttpResponse(result)) {
              return result as HttpResponse<T>
            }
            finalError = result as HttpError
          }
        }
        throw finalError
      }

      // Handle other errors (network, timeout, etc.)
      const networkResponse: HttpResponse<null> = {
        data: null,
        status: 0,
        statusText: 'Network Error',
        headers: {},
        url,
        config,
      }
      const httpError = new HttpError(
        error instanceof Error ? error.message : String(error),
        0,
        'Network Error',
        config,
        networkResponse
      )

      // Apply response error interceptors
      let finalError = httpError
      for (const interceptor of this.responseInterceptors) {
        if (interceptor.onError) {
          const result = await interceptor.onError(finalError)
          if (this.isHttpResponse(result)) {
            return result as HttpResponse<T>
          }
          finalError = result as HttpError
        }
      }

      throw finalError
    }
  }

  private buildUrl(path: string): string {
    let baseUrl = this.config.baseURL.endsWith('/')
      ? this.config.baseURL.slice(0, -1)
      : this.config.baseURL
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    if (baseUrl.endsWith('/api') && cleanPath.startsWith('/api/')) {
      baseUrl = baseUrl.slice(0, -4)
    }
    return `${baseUrl}${cleanPath}`
  }

  private buildHeaders(headers: Record<string, string>): HeadersInit {
    return new Headers(headers)
  }

  private serializeBody(body: unknown, headers: Record<string, string>): string {
    const contentType = headers['content-type'] || headers['Content-Type']

    if (typeof body === 'string') {
      return body
    }

    if (contentType?.includes('application/json') || !contentType) {
      headers['Content-Type'] = 'application/json'
      return JSON.stringify(body)
    }

    if (contentType?.includes('application/x-www-form-urlencoded')) {
      if (typeof body === 'object' && body !== null) {
        return new URLSearchParams(body as Record<string, string>).toString()
      }
    }

    return String(body)
  }

  private async deserializeResponse<T>(response: Response): Promise<T | null> {
    const contentType = response.headers.get('content-type')

    if (!contentType || response.status === 204) {
      return null
    }

    if (contentType.includes('application/json')) {
      return (await response.json()) as T
    }

    if (contentType.includes('text/') || contentType.includes('application/xml') || contentType.includes('text/xml')) {
      return (await response.text()) as unknown as T
    }

    // Return as ArrayBuffer for binary data
    return (await response.arrayBuffer()) as unknown as T
  }

  private extractHeaders(response: Response): Record<string, string> {
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })
    return headers
  }

  private isHttpResponse(value: unknown): value is HttpResponse<unknown> {
    return Boolean(
      value &&
      typeof value === 'object' &&
      'status' in (value as HttpResponse<unknown>) &&
      'statusText' in (value as HttpResponse<unknown>) &&
      'url' in (value as HttpResponse<unknown>) &&
      'config' in (value as HttpResponse<unknown>)
    )
  }

  private shouldRetry(status: number): boolean {
    // Retry on 5xx server errors and specific 4xx errors
    return status >= 500 || status === 429 || status === 408
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
