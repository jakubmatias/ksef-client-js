import { z } from 'zod'

// HTTP method enum
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
}

// HTTP request configuration schema
export const HttpRequestConfigSchema = z.object({
  method: z.nativeEnum(HttpMethod).optional().default(HttpMethod.GET),
  headers: z.record(z.string(), z.string()).optional().default({}),
  body: z.unknown().optional(),
  timeout: z.number().optional().default(30000),
  retries: z.number().optional().default(3),
  retryDelay: z.number().optional().default(1000),
})

export type HttpRequestConfig = z.infer<typeof HttpRequestConfigSchema>

// HTTP response interface
export interface HttpResponse<T = unknown> {
  data: T | null
  status: number
  statusText: string
  headers: Record<string, string>
  url: string
  config: HttpRequestConfig
}

// HTTP error class
export class HttpError extends Error {
  public readonly status: number
  public readonly statusText: string
  public readonly response: HttpResponse | undefined
  public readonly config: HttpRequestConfig

  constructor(
    message: string,
    status: number,
    statusText: string,
    config: HttpRequestConfig,
    response?: HttpResponse | undefined
  ) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.statusText = statusText
    this.config = config
    this.response = response
  }
}

// Request/Response interceptors
export interface RequestInterceptor {
  onRequest?: (config: HttpRequestConfig) => Promise<HttpRequestConfig> | HttpRequestConfig
  onError?: (error: Error) => Promise<Error> | Error
}

export interface ResponseInterceptor {
  onResponse?: <T>(response: HttpResponse<T>) => Promise<HttpResponse<T>> | HttpResponse<T>
  onError?: <T>(
    error: HttpError
  ) => Promise<HttpError | HttpResponse<T>> | HttpError | HttpResponse<T>
}

// HTTP client configuration
export const HttpClientConfigSchema = z.object({
  baseURL: z.string(),
  timeout: z.number().optional().default(30000),
  retries: z.number().optional().default(3),
  retryDelay: z.number().optional().default(1000),
  headers: z.record(z.string(), z.string()).optional().default({}),
  rateLimit: z.number().optional(), // requests per second
})

export type HttpClientConfig = z.infer<typeof HttpClientConfigSchema>

// Rate limiter interface
export interface RateLimiter {
  canMakeRequest(): Promise<boolean>
  waitForSlot(): Promise<void>
}
