import { AuthenticationError, CertificateError } from '@/types/auth'
import { HttpError } from '@/types/http'

type ErrorWithCode = Error & { code?: string; details?: unknown }
type NormalizedError = {
  message: string
  code: string | undefined
  httpStatus: number | undefined
  httpStatusText: string | undefined
  url: string | undefined
  detailLines: string[]
  authRelated: boolean
}

export function formatAuthCliError(error: unknown): string {
  const lines: string[] = []
  const normalized = normalizeError(error)

  lines.push(normalized.message)

  if (normalized.code) {
    lines.push(`Code: ${normalized.code}`)
  }

  if (typeof normalized.httpStatus === 'number') {
    const statusText = normalized.httpStatusText ? ` ${normalized.httpStatusText}` : ''
    lines.push(`HTTP: ${normalized.httpStatus}${statusText}`)
  }

  if (normalized.url) {
    lines.push(`URL: ${normalized.url}`)
  }

  if (normalized.detailLines.length > 0) {
    lines.push(...normalized.detailLines)
  }

  if (normalized.authRelated) {
    lines.push('Hint: set KSEF_DEBUG_AUTH=1 for raw auth errors and KSEF_DEBUG_AUTH_XML=1 to dump the signed AuthTokenRequest XML.')
  }

  return lines.join('\n')
}

function normalizeError(error: unknown): NormalizedError {
  if (error instanceof HttpError) {
    return {
      message: error.message,
      code: 'HTTP_ERROR',
      httpStatus: error.status,
      httpStatusText: error.statusText,
      url: error.response?.url,
      detailLines: renderStructuredDetails(extractHttpErrorDetails(error)),
      authRelated: true,
    }
  }

  if (error instanceof AuthenticationError || error instanceof CertificateError) {
    return {
      message: error.message,
      code: error.code,
      httpStatus: extractHttpStatus(error.details),
      httpStatusText: extractHttpStatusText(error.details),
      url: extractUrl(error.details),
      detailLines: renderStructuredDetails(error.details),
      authRelated: true,
    }
  }

  if (error instanceof Error) {
    const typedError = error as ErrorWithCode
    return {
      message: typedError.message,
      code: typedError.code ?? undefined,
      httpStatus: undefined,
      httpStatusText: undefined,
      url: undefined,
      detailLines: renderStructuredDetails(typedError.details),
      authRelated: false,
    }
  }

  return {
    message: String(error),
    code: undefined,
    httpStatus: undefined,
    httpStatusText: undefined,
    url: undefined,
    detailLines: [],
    authRelated: false,
  }
}

function extractHttpErrorDetails(error: HttpError): Record<string, unknown> {
  const responseData = isRecord(error.response?.data) ? error.response.data : undefined
  const exceptionDetails = responseData?.['exception']

  return {
    status: error.status,
    statusText: error.statusText,
    url: error.response?.url,
    response: error.response?.data,
    exceptionDetails,
  }
}

function extractHttpStatus(details: unknown): number | undefined {
  if (!isRecord(details)) {
    return undefined
  }
  return typeof details['status'] === 'number' ? details['status'] : undefined
}

function extractHttpStatusText(details: unknown): string | undefined {
  if (!isRecord(details)) {
    return undefined
  }
  return typeof details['statusText'] === 'string' ? details['statusText'] : undefined
}

function extractUrl(details: unknown): string | undefined {
  if (!isRecord(details)) {
    return undefined
  }
  return typeof details['url'] === 'string' ? details['url'] : undefined
}

function renderStructuredDetails(details: unknown): string[] {
  if (details == null) {
    return []
  }

  if (typeof details === 'string') {
    return [`Details: ${details}`]
  }

  if (details instanceof Error) {
    return [`Details: ${details.message}`]
  }

  if (!isRecord(details)) {
    return [`Details: ${String(details)}`]
  }

  const nestedDetails = details['details']
  if (nestedDetails !== undefined && isRecord(nestedDetails)) {
    const nestedLines = renderStructuredDetails(nestedDetails)
    if (nestedLines.length > 0) {
      return nestedLines
    }
  }

  const lines: string[] = []
  const exceptionDetailList = getExceptionDetailList(details)
  if (exceptionDetailList.length > 0) {
    for (const item of exceptionDetailList) {
      lines.push(`KSeF detail: ${item}`)
    }
  }

  const response = details['response']
  const rawResponse = details['rawResponse']
  const validation = details['validation']

  if (validation !== undefined) {
    lines.push(`Validation: ${safeJson(validation)}`)
  }

  if (rawResponse !== undefined) {
    lines.push(`Raw response: ${safeJson(rawResponse)}`)
  }

  if (response !== undefined) {
    lines.push(`Response: ${safeJson(response)}`)
  } else if (lines.length === 0) {
    lines.push(`Details: ${safeJson(details)}`)
  }

  return lines
}

function getExceptionDetailList(details: Record<string, unknown>): string[] {
  const exception = details['exceptionDetails']
  if (!isRecord(exception)) {
    return []
  }

  const list = exception['exceptionDetailList']
  if (!Array.isArray(list)) {
    return []
  }

  return list.map(item => typeof item === 'string' ? item : safeJson(item))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
