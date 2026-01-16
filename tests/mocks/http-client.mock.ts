import { vi } from 'vitest'
import { HttpResponse, HttpMethod } from '@/types/http'
import { HttpClient } from '@/http/http-client'

export interface MockHttpClientConfig {
  baseURL?: string
  responses?: Record<string, unknown>
  errors?: Record<string, Error>
  delay?: number
}

export function createMockHttpClient(config: MockHttpClientConfig = {}): HttpClient {
  const { responses = {}, errors = {}, delay = 0 } = config

  const createMockResponse = async <T>(
    url: string,
    method: string
  ): Promise<HttpResponse<T>> => {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    const key = `${method}:${url}`

    if (errors[key]) {
      throw errors[key]
    }

    const data = responses[key] as T

    return {
      data: data ?? null,
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      url,
      config: {
        method: method as HttpMethod,
        headers: {},
        timeout: 30000,
        retries: 3,
        retryDelay: 1000,
      },
    }
  }

  return {
    get: vi.fn().mockImplementation(<T>(url: string) => createMockResponse<T>(url, 'GET')),
    post: vi.fn().mockImplementation(<T>(url: string) => createMockResponse<T>(url, 'POST')),
    put: vi.fn().mockImplementation(<T>(url: string) => createMockResponse<T>(url, 'PUT')),
    delete: vi.fn().mockImplementation(<T>(url: string) => createMockResponse<T>(url, 'DELETE')),
    patch: vi.fn().mockImplementation(<T>(url: string) => createMockResponse<T>(url, 'PATCH')),
    request: vi.fn().mockImplementation(<T>(url: string, config: any) =>
      createMockResponse<T>(url, config.method)
    ),
    addRequestInterceptor: vi.fn(),
    addResponseInterceptor: vi.fn(),
  }
}