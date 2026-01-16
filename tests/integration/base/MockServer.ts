import { createServer, IncomingMessage, ServerResponse } from 'http'

export interface MockResponse {
  status: number
  headers?: Record<string, string>
  body?: any
}

export interface MockRequest {
  method: string
  path: string
  headers: Record<string, string>
  body?: any
}

export type MockHandler = (request: MockRequest) => MockResponse | Promise<MockResponse>

export class MockServer {
  private server?: any
  private handlers = new Map<string, MockHandler>()
  private defaultHandlers = new Map<string, MockHandler>()
  public port: number = 0
  private sessionStates = new Map<string, 'active' | 'closed'>()
  private sessionInvoiceCounts = new Map<string, number>()
  private invoiceStatusProgression = new Map<string, { status: string; createdAt: number }>()

  constructor() {
    this.setupDefaultHandlers()
  }

  public async start(port?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer(this.handleRequest.bind(this))

      this.server.on('error', reject)

      this.server.listen(port || 0, '127.0.0.1', () => {
        this.port = this.server.address()?.port || 0
        console.log(`Mock server started on port ${this.port}`)
        resolve()
      })
    })
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Mock server stopped')
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  public addHandler(path: string, handler: MockHandler): void {
    this.handlers.set(path, handler)
  }

  public removeHandler(path: string): void {
    this.handlers.delete(path)
  }

  public reset(): void {
    this.handlers.clear()
    this.sessionStates.clear()
    this.sessionInvoiceCounts.clear()
    this.invoiceStatusProgression.clear()
  }

  public createFetchHandler(): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
    return async (input, init) => {
      const requestInfo = this.normalizeFetchRequest(input, init)
      const response = await this.findAndExecuteHandler(requestInfo)
      return this.buildFetchResponse(response)
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      // Use WHATWG URL API instead of deprecated url.parse()
      const baseUrl = `http://localhost:${this.port}`
      const url = new URL(req.url || '/', baseUrl)
      const path = url.pathname

      // Collect request body
      let body = ''
      req.on('data', chunk => {
        body += chunk.toString()
      })

      req.on('end', async () => {
        const request: MockRequest = {
          method: req.method || 'GET',
          path,
          headers: req.headers as Record<string, string>,
          body: body ? this.tryParseJson(body) : undefined,
        }

        try {
          const response = await this.findAndExecuteHandler(request)
          this.sendResponse(res, response)
        } catch (error) {
          console.error('Mock server error:', error)
          this.sendResponse(res, {
            status: 500,
            body: { error: 'Internal server error' },
          })
        }
      })
    } catch (error) {
      console.error('Mock server request handling error:', error)
      this.sendResponse(res, {
        status: 500,
        body: { error: 'Internal server error' },
      })
    }
  }

  private async findAndExecuteHandler(request: MockRequest): Promise<MockResponse> {
    // Try exact path match first
    const exactHandler = this.handlers.get(request.path)
    if (exactHandler) {
      return await exactHandler(request)
    }

    // Try pattern matching
    for (const [pattern, handler] of this.handlers.entries()) {
      if (this.matchesPattern(pattern, request.path)) {
        return await handler(request)
      }
    }

    // Try default handlers
    const defaultHandler = this.defaultHandlers.get(request.path)
    if (defaultHandler) {
      return await defaultHandler(request)
    }

    // Try pattern matching on default handlers
    for (const [pattern, handler] of this.defaultHandlers.entries()) {
      if (this.matchesPattern(pattern, request.path)) {
        return await handler(request)
      }
    }

    // Default response
    return {
      status: 404,
      body: { error: 'Not found' },
    }
  }

  private normalizeFetchRequest(input: RequestInfo | URL, init?: RequestInit): MockRequest {
    const { url, method, headers, body } = this.extractFetchParts(input, init)
    const requestBody = body ? this.tryParseJson(body) : undefined

    return {
      method,
      path: url.pathname,
      headers,
      body: requestBody,
    }
  }

  private extractFetchParts(
    input: RequestInfo | URL,
    init?: RequestInit
  ): {
    url: URL
    method: string
    headers: Record<string, string>
    body?: string
  } {
    const url = typeof input === 'string'
      ? new URL(input)
      : input instanceof URL
        ? input
        : new URL(input.url)

    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const headers = this.normalizeHeaders(init?.headers || (input instanceof Request ? input.headers : undefined))

    let body: string | undefined
    if (typeof init?.body === 'string') {
      body = init.body
    } else if (init?.body instanceof Uint8Array) {
      body = new TextDecoder().decode(init.body)
    }

    return { url, method, headers, body }
  }

  private normalizeHeaders(headers?: HeadersInit): Record<string, string> {
    if (!headers) {
      return {}
    }

    if (headers instanceof Headers) {
      const result: Record<string, string> = {}
      headers.forEach((value, key) => {
        result[key] = value
      })
      return result
    }

    if (Array.isArray(headers)) {
      return headers.reduce<Record<string, string>>((acc, [key, value]) => {
        acc[key] = value
        return acc
      }, {})
    }

    return { ...headers }
  }

  private buildFetchResponse(response: MockResponse): Response {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })

    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        headers.set(key, value)
      }
    }

    if (response.body === undefined || response.body === null) {
      return new Response(null, { status: response.status, headers })
    }

    const body = typeof response.body === 'string' ? response.body : JSON.stringify(response.body)
    return new Response(body, { status: response.status, headers })
  }

  private matchesPattern(pattern: string, path: string): boolean {
    // Simple pattern matching with wildcards
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\{[^}]+\}/g, '[^/]+')

    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(path)
  }

  private sendResponse(res: ServerResponse, response: MockResponse): void {
    res.statusCode = response.status

    // Set default headers
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    // Set custom headers
    if (response.headers) {
      for (const [key, value] of Object.entries(response.headers)) {
        res.setHeader(key, value)
      }
    }

    // Send body
    if (response.body) {
      const bodyString = typeof response.body === 'string'
        ? response.body
        : JSON.stringify(response.body)
      res.end(bodyString)
    } else {
      res.end()
    }
  }

  private tryParseJson(str: string): any {
    try {
      return JSON.parse(str)
    } catch {
      return str
    }
  }

  private setupDefaultHandlers(): void {
    // Auth challenge endpoint
    this.defaultHandlers.set('/auth/challenge', () => ({
      status: 200,
      body: {
        challenge: `mock-challenge-${Date.now()}`,
        timestamp: new Date().toISOString(),
      },
    }))

    // Auth challenge endpoint (v2)
    this.defaultHandlers.set('/api/v2/auth/challenge', () => ({
      status: 200,
      body: {
        challenge: `mock-challenge-${Date.now()}`,
        timestamp: new Date().toISOString(),
      },
    }))

    // Auth token endpoint
    this.defaultHandlers.set('/auth/token', (request) => {
      if (request.method === 'POST') {
        return {
          status: 200,
          body: {
            sessionToken: `mock-session-token-${Date.now()}`,
            referenceNumber: `mock-ref-${Date.now()}`,
            timestamp: new Date().toISOString(),
          },
        }
      }
      return { status: 405, body: { error: 'Method not allowed' } }
    })

    // Auth token xades endpoint (v2)
    this.defaultHandlers.set('/api/v2/auth/xades-signature', (request) => {
      if (request.method === 'POST') {
        return {
          status: 202,
          body: {
            referenceNumber: `mock-ref-${Date.now()}`,
            authenticationToken: {
              token: `mock-auth-token-${Date.now()}`,
              validUntil: new Date(Date.now() + 600000).toISOString(),
            },
          },
        }
      }
      return { status: 405, body: { error: 'Method not allowed' } }
    })

    // Auth status endpoint
    this.defaultHandlers.set('/auth/status/*', () => ({
      status: 200,
      body: {
        referenceNumber: 'mock-ref-123',
        processingCode: 200,
        processingDescription: 'Authentication successful',
        timestamp: new Date().toISOString(),
      },
    }))

    // Auth status endpoint (v2)
    this.defaultHandlers.set('/api/v2/auth/*', () => ({
      status: 200,
      body: {
        startDate: new Date().toISOString(),
        authenticationMethod: 'QualifiedSignature',
        status: {
          code: 200,
          description: 'Authentication successful',
        },
      },
    }))

    // Auth redeem endpoint
    this.defaultHandlers.set('/auth/redeem', () => ({
      status: 200,
      body: {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: 3600,
        tokenType: 'Bearer',
      },
    }))

    // Auth redeem endpoint (v2)
    this.defaultHandlers.set('/api/v2/auth/token/redeem', () => ({
      status: 200,
      body: {
        accessToken: {
          token: `mock-access-token-${Date.now()}`,
          validUntil: new Date(Date.now() + 3600000).toISOString(),
        },
        refreshToken: {
          token: `mock-refresh-token-${Date.now()}`,
          validUntil: new Date(Date.now() + 86400000).toISOString(),
        },
      },
    }))

    // Auth refresh endpoint (v2)
    this.defaultHandlers.set('/api/v2/auth/token/refresh', () => ({
      status: 200,
      body: {
        accessToken: {
          token: `mock-access-token-${Date.now()}`,
          validUntil: new Date(Date.now() + 3600000).toISOString(),
        },
      },
    }))

    // Auth revoke endpoint (v2)
    this.defaultHandlers.set('/api/v2/auth/token', (request) => {
      if (request.method === 'DELETE') {
        return { status: 204 }
      }
      return { status: 405, body: { error: 'Method not allowed' } }
    })

    // Session endpoints per OpenAPI spec
    // POST /api/v2/sessions/online
    this.defaultHandlers.set('/api/v2/sessions/online', (_request) => {
      const referenceNumber = `20250625-SO-${Math.random().toString(16).substr(2, 10).toUpperCase()}-${Math.random().toString(16).substr(2, 10).toUpperCase()}-07`
      this.sessionStates.set(referenceNumber, 'active')
      this.sessionInvoiceCounts.set(referenceNumber, 0)
      return {
        status: 201,
        body: {
          referenceNumber,
          validUntil: new Date(Date.now() + 1800000).toISOString(),
        },
      }
    })

    // POST /api/v2/sessions/batch
    this.defaultHandlers.set('/api/v2/sessions/batch', (_request) => {
      const referenceNumber = `20250625-SB-${Math.random().toString(16).substr(2, 10).toUpperCase()}-${Math.random().toString(16).substr(2, 10).toUpperCase()}-07`
      this.sessionStates.set(referenceNumber, 'active')
      this.sessionInvoiceCounts.set(referenceNumber, 0)
      return {
        status: 201,
        body: {
          referenceNumber,
          validUntil: new Date(Date.now() + 7200000).toISOString(),
        },
      }
    })

    // GET /api/v2/auth/sessions - list active authentication sessions
    this.defaultHandlers.set('/api/v2/auth/sessions', (_request) => ({
      status: 200,
      body: {
        continuationToken: null,
        items: [
          {
            startDate: new Date().toISOString(),
            authenticationMethod: 'Token',
            status: {
              code: 200,
              description: 'Authentication successful'
            },
            isTokenRedeemed: true,
            referenceNumber: 'mock-auth-session-1'
          },
          {
            startDate: new Date(Date.now() - 600000).toISOString(),
            authenticationMethod: 'Token',
            status: {
              code: 200,
              description: 'Authentication successful'
            },
            isTokenRedeemed: true,
            referenceNumber: 'mock-auth-session-2'
          }
        ]
      }
    }))

    // Session API v2 handlers per OpenAPI spec
    this.defaultHandlers.set('/api/v2/sessions/*', (request) => {
      const path = request.path
      const pathParts = path.split('/')

      // Handle session status: GET /api/v2/sessions/{referenceNumber}
      if (request.method === 'GET' && pathParts.length === 5) {
        const referenceNumber = pathParts[4]
        const sessionState = this.sessionStates.get(referenceNumber) || 'active'

        if (sessionState === 'closed') {
          return {
            status: 200,
            body: {
              sessionId: referenceNumber,
              status: {
                code: 400,
                description: 'Session is closed'
              },
              validUntil: new Date(Date.now() + 1500000).toISOString(),
              invoiceCount: 3,
              successfulInvoiceCount: 3,
              failedInvoiceCount: 0,
              upo: null
            },
          }
        }

        const invoiceCount = this.sessionInvoiceCounts.get(referenceNumber) || 0
        return {
          status: 200,
          body: {
            sessionId: referenceNumber,
            status: {
              code: 200,
              description: 'Sesja interaktywna przetworzona pomyślnie'
            },
            validUntil: new Date(Date.now() + 1500000).toISOString(),
            invoiceCount,
            successfulInvoiceCount: invoiceCount,
            failedInvoiceCount: 0,
            upo: null // null until session is closed
          },
        }
      }

      // Handle session close: POST /api/v2/sessions/online/{referenceNumber}/close
      if (request.method === 'POST' && pathParts.length === 7 &&
          pathParts[4] === 'online' && pathParts[6] === 'close') {
        const referenceNumber = pathParts[5]
        this.sessionStates.set(referenceNumber, 'closed')
        return {
          status: 204,
          body: null, // 204 No Content per OpenAPI spec
        }
      }

      // Handle batch session close: POST /api/v2/sessions/batch/{referenceNumber}/close
      if (request.method === 'POST' && pathParts.length === 7 &&
          pathParts[4] === 'batch' && pathParts[6] === 'close') {
        const referenceNumber = pathParts[5]
        this.sessionStates.set(referenceNumber, 'closed')
        return {
          status: 204,
          body: null, // 204 No Content per OpenAPI spec
        }
      }

      return { status: 404, body: { error: 'Session endpoint not found' } }
    })

    // Legacy session handlers for backward compatibility
    this.defaultHandlers.set('/session/*', (request) => {
      const path = request.path
      const pathParts = path.split('/')

      // Handle session info: GET /session/{sessionId}/status (legacy)
      if (request.method === 'GET' && pathParts.length === 4 && pathParts[3] === 'status') {
        const sessionId = pathParts[2]
        return {
          status: 200,
          body: {
            sessionId,
            status: 'active',
            sessionType: 'online',
            invoiceCount: 3,
            createdAt: new Date(Date.now() - 300000).toISOString(),
            expiresAt: new Date(Date.now() + 1500000).toISOString(),
          },
        }
      }

      // Handle session close: POST /session/{sessionId}/close (legacy)
      if (request.method === 'POST' && pathParts.length === 4 && pathParts[3] === 'close') {
        const sessionId = pathParts[2]
        return {
          status: 200,
          body: {
            sessionId,
            status: 'closed',
            closedAt: new Date().toISOString(),
            invoiceCount: 3,
            upoReferenceNumber: `mock-upo-ref-${Date.now()}`,
          },
        }
      }

      // Handle session refresh: POST /session/{sessionId}/refresh (legacy)
      if (request.method === 'POST' && pathParts.length === 4 && pathParts[3] === 'refresh') {
        const sessionId = pathParts[2]
        return {
          status: 200,
          body: {
            sessionId,
            status: 'active',
            sessionType: 'online',
            expiresAt: new Date(Date.now() + 1800000).toISOString(),
          },
        }
      }

      // Handle session UPO: GET /session/{sessionId}/upo (legacy)
      if (request.method === 'GET' && pathParts.length === 4 && pathParts[3] === 'upo') {
        const sessionId = pathParts[2]
        return {
          status: 200,
          body: {
            sessionId,
            referenceNumber: `upo-ref-${Date.now()}`,
            upoData: Buffer.from('Mock UPO document content').toString('base64'),
            timestamp: new Date().toISOString(),
          },
        }
      }

      // Handle invoice submission: POST /session/online/{sessionId}/invoice
      if (request.method === 'POST' && pathParts.length === 5 &&
          pathParts[2] === 'online' && pathParts[4] === 'invoice') {
        const sessionId = pathParts[3]
        // Increment invoice counter for this session
        const currentCount = this.sessionInvoiceCounts.get(sessionId) || 0
        this.sessionInvoiceCounts.set(sessionId, currentCount + 1)

        const invoiceRef = `mock-inv-ref-${Date.now()}`
        // Track invoice status progression
        this.invoiceStatusProgression.set(invoiceRef, {
          status: 'submitted',
          createdAt: Date.now()
        })

        return {
          status: 200,
          body: {
            sessionId,
            invoiceReferenceNumber: invoiceRef,
            ksefReferenceNumber: `mock-ksef-ref-${Date.now()}`,
            result: 'success',
            status: 'submitted',
            timestamp: new Date().toISOString(),
          },
        }
      }

      return { status: 404, body: { error: 'Session endpoint not found' } }
    })

    // Invoice endpoints
    this.defaultHandlers.set('/session/online/*/invoice', (request) => {
      if (request.method === 'POST') {
        return {
          status: 200,
          body: {
            sessionId: 'mock-session-123',
            invoiceReferenceNumber: `mock-inv-ref-${Date.now()}`,
            ksefReferenceNumber: `mock-ksef-ref-${Date.now()}`,
            result: 'success',
            status: 'processing',
            timestamp: new Date().toISOString(),
          },
        }
      }
      return { status: 404, body: { error: 'Method not allowed' } }
    })

    // Invoice status endpoints
    this.defaultHandlers.set('/invoice/*/status', (request) => {
      if (request.method === 'GET') {
        const pathParts = request.path.split('/')
        const invoiceRef = pathParts[2]

        // Get progressive status based on time elapsed
        let currentStatus = 'accepted' // Default for untracked invoices
        const invoiceData = this.invoiceStatusProgression.get(invoiceRef)

        if (invoiceData) {
          const elapsedTime = Date.now() - invoiceData.createdAt
          if (elapsedTime < 2000) {
            // First 2 seconds: submitted
            currentStatus = 'submitted'
          } else {
            // After 2 seconds: accepted
            currentStatus = 'accepted'
          }
        }

        return {
          status: 200,
          body: {
            invoiceReferenceNumber: invoiceRef,
            ksefReferenceNumber: `mock-ksef-ref-${Date.now()}`,
            result: 'success',
            status: currentStatus,
            timestamp: new Date().toISOString(),
          },
        }
      }
      return { status: 404, body: { error: 'Method not allowed' } }
    })

    // Invoice query endpoint
    this.defaultHandlers.set('/invoice/query', (request) => {
      if (request.method === 'POST') {
        // Generate realistic test data based on request criteria
        const requestBody = request.body || {}
        const testNip = requestBody.nip || '1234567890'
        const minAmount = requestBody.minAmount || 0
        const maxAmount = requestBody.maxAmount || 100000

        // Generate amounts within the specified range
        const generateAmountInRange = (min: number, max: number): number => {
          const amount = min + Math.random() * (max - min)
          return Math.round(amount * 100) / 100 // Round to 2 decimal places
        }

        const grossAmount1 = generateAmountInRange(minAmount, maxAmount)
        const grossAmount2 = generateAmountInRange(minAmount, maxAmount)

        // Calculate net and VAT amounts (assuming 23% VAT rate)
        const calculateNetAndVat = (gross: number) => {
          const net = gross / 1.23
          const vat = gross - net
          return {
            net: Math.round(net * 100) / 100,
            vat: Math.round(vat * 100) / 100
          }
        }

        const amounts1 = calculateNetAndVat(grossAmount1)
        const amounts2 = calculateNetAndVat(grossAmount2)

        return {
          status: 200,
          body: {
            invoices: [
              {
                invoiceNumber: `MOCK-INV-${Date.now()}-1`,
                ksefReferenceNumber: `KSEF-REF-${Date.now()}-1`,
                issueDate: new Date().toISOString().split('T')[0],
                status: 'accepted',
                seller: {
                  nip: testNip,
                  name: 'Mock Seller Company',
                  address: 'Mock Street 123, Warsaw'
                },
                buyer: {
                  nip: '9876543210',
                  name: 'Mock Buyer Company',
                  address: 'Buyer Street 456, Krakow'
                },
                grossTotal: {
                  amount: grossAmount1,
                  currency: 'PLN'
                },
                netTotal: {
                  amount: amounts1.net,
                  currency: 'PLN'
                },
                vatTotal: {
                  amount: amounts1.vat,
                  currency: 'PLN'
                }
              },
              {
                invoiceNumber: `MOCK-INV-${Date.now()}-2`,
                ksefReferenceNumber: `KSEF-REF-${Date.now()}-2`,
                issueDate: new Date().toISOString().split('T')[0],
                status: 'accepted',
                seller: {
                  nip: testNip,
                  name: 'Mock Seller Company',
                  address: 'Mock Street 123, Warsaw'
                },
                buyer: {
                  nip: '9876543210',
                  name: 'Mock Buyer Company',
                  address: 'Buyer Street 456, Krakow'
                },
                grossTotal: {
                  amount: grossAmount2,
                  currency: 'PLN'
                },
                netTotal: {
                  amount: amounts2.net,
                  currency: 'PLN'
                },
                vatTotal: {
                  amount: amounts2.vat,
                  currency: 'PLN'
                }
              }
            ],
            totalCount: 2,
            hasMore: false,
            nextOffset: null
          },
        }
      }
      return { status: 404, body: { error: 'Method not allowed' } }
    })

    // Invoice download endpoint
    this.defaultHandlers.set('/invoice/*', (request) => {
      if (request.method === 'GET' && !request.path.includes('status') && !request.path.includes('query')) {
        const pathParts = request.path.split('/')
        const ksefRef = pathParts[2]
        const acceptHeader = request.headers['accept'] || 'application/xml'

        return {
          status: 200,
          body: {
            ksefReferenceNumber: ksefRef,
            format: acceptHeader.includes('pdf') ? 'pdf' : 'xml',
            invoiceData: acceptHeader.includes('pdf')
              ? Buffer.from('Mock PDF invoice content').toString('base64')
              : '<?xml version="1.0" encoding="UTF-8"?><invoice><number>' + ksefRef + '</number></invoice>',
            timestamp: new Date().toISOString(),
          },
        }
      }
      return { status: 404, body: { error: 'Method not allowed' } }
    })

    // Default OPTIONS handler for CORS
    this.defaultHandlers.set('*', (request) => {
      if (request.method === 'OPTIONS') {
        return { status: 200 }
      }
      return { status: 404, body: { error: 'Not found' } }
    })
  }
}
