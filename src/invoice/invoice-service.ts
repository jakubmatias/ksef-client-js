import {
  Invoice,
  InvoiceSubmissionRequest,
  InvoiceSubmissionResponse,
  InvoiceQueryFilters,
  InvoiceQueryResponse,
  InvoiceDownloadResponse,
  InvoiceError,
  InvoiceValidationError,
  SubmissionResult,
} from '@/types/invoice'
import { HttpClient } from '@/http/http-client'

export interface InvoiceService {
  submitInvoice(sessionId: string, invoice: Invoice, validateOnly?: boolean): Promise<InvoiceSubmissionResponse>
  validateInvoice(sessionId: string, invoice: Invoice): Promise<string[]>
  queryInvoices(filters: InvoiceQueryFilters): Promise<InvoiceQueryResponse>
  downloadInvoice(ksefReferenceNumber: string, format?: 'xml' | 'pdf'): Promise<InvoiceDownloadResponse>
  getInvoiceStatus(ksefReferenceNumber: string): Promise<{ status: string; timestamp: string }>
}

export class DefaultInvoiceService implements InvoiceService {
  constructor(private readonly httpClient: HttpClient) {}

  public async submitInvoice(
    sessionId: string,
    invoice: Invoice,
    validateOnly = false
  ): Promise<InvoiceSubmissionResponse> {
    try {
      // Pre-validation
      await this.validateInvoiceStructure(invoice)

      const request: InvoiceSubmissionRequest = {
        sessionId,
        invoice,
        validateOnly,
      }

      const response = await this.httpClient.post<InvoiceSubmissionResponse>(
        `/session/online/${sessionId}/invoice`,
        {
          body: request,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.data) {
        throw new InvoiceError('Empty response from invoice submission', 'EMPTY_RESPONSE', invoice.header.invoiceNumber)
      }

      // Handle validation errors
      if (response.data.result === SubmissionResult.ERROR && response.data.errors) {
        throw new InvoiceValidationError(
          'Invoice validation failed',
          invoice.header.invoiceNumber,
          response.data.errors
        )
      }

      return response.data
    } catch (error) {
      if (error instanceof InvoiceError) {
        throw error
      }
      throw new InvoiceError(
        'Invoice submission failed',
        'SUBMISSION_FAILED',
        invoice.header.invoiceNumber,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  public async validateInvoice(sessionId: string, invoice: Invoice): Promise<string[]> {
    try {
      const response = await this.submitInvoice(sessionId, invoice, true)
      return response.validationMessages ?? []
    } catch (error) {
      if (error instanceof InvoiceValidationError) {
        return error.validationErrors
      }
      throw error
    }
  }

  public async queryInvoices(filters: InvoiceQueryFilters): Promise<InvoiceQueryResponse> {
    try {
      const response = await this.httpClient.post<InvoiceQueryResponse>('/invoice/query', {
        body: filters,
      })

      if (!response.data) {
        throw new InvoiceError('Empty response from invoice query', 'EMPTY_RESPONSE')
      }

      return response.data
    } catch (error) {
      throw new InvoiceError(
        'Invoice query failed',
        'QUERY_FAILED',
        undefined,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  public async downloadInvoice(
    ksefReferenceNumber: string,
    format: 'xml' | 'pdf' = 'xml'
  ): Promise<InvoiceDownloadResponse> {
    try {
      const response = await this.httpClient.get<InvoiceDownloadResponse>(
        `/invoice/${ksefReferenceNumber}`,
        {
          headers: {
            Accept: format === 'pdf' ? 'application/pdf' : 'application/xml',
          },
        }
      )

      if (!response.data) {
        throw new InvoiceError('Empty response from invoice download', 'EMPTY_RESPONSE')
      }

      return response.data
    } catch (error) {
      throw new InvoiceError(
        'Invoice download failed',
        'DOWNLOAD_FAILED',
        undefined,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  public async getInvoiceStatus(
    ksefReferenceNumber: string
  ): Promise<{ status: string; timestamp: string }> {
    try {
      const response = await this.httpClient.get<{ status: string; timestamp: string }>(
        `/invoice/${ksefReferenceNumber}/status`
      )

      if (!response.data) {
        throw new InvoiceError('Empty response from status check', 'EMPTY_RESPONSE')
      }

      return response.data
    } catch (error) {
      throw new InvoiceError(
        'Status check failed',
        'STATUS_CHECK_FAILED',
        undefined,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private async validateInvoiceStructure(invoice: Invoice): Promise<void> {
    const errors: string[] = []

    // Validate invoice header
    if (!invoice.header.invoiceNumber) {
      errors.push('Invoice number is required')
    }

    if (!invoice.header.seller.name) {
      errors.push('Seller name is required')
    }

    if (!invoice.header.buyer.name) {
      errors.push('Buyer name is required')
    }

    // Validate invoice lines
    if (!invoice.lines || invoice.lines.length === 0) {
      errors.push('At least one invoice line is required')
    }

    // Validate line numbering
    const lineNumbers = new Set<number>()
    for (const [index, line] of invoice.lines.entries()) {
      const lineNumber = line.lineNumber ?? index + 1
      if (lineNumbers.has(lineNumber)) {
        errors.push(`Duplicate line number: ${lineNumber}`)
      }
      lineNumbers.add(lineNumber)

      // Validate amounts calculation
      const expectedNet = line.unitPrice.amount * line.quantity
      const expectedTax = expectedNet * line.taxRate.rate
      const expectedGross = expectedNet + expectedTax

      const netDiff = Math.abs(expectedNet - line.netAmount.amount)
      const taxDiff = Math.abs(expectedTax - line.taxAmount.amount)
      const grossDiff = Math.abs(expectedGross - line.grossAmount.amount)

      if (netDiff > 0.01) {
        errors.push(`Line ${lineNumber}: Net amount calculation error`)
      }
      if (taxDiff > 0.01) {
        errors.push(`Line ${lineNumber}: Tax amount calculation error`)
      }
      if (grossDiff > 0.01) {
        errors.push(`Line ${lineNumber}: Gross amount calculation error`)
      }
    }

    // Validate totals
    if (invoice.totals) {
      const expectedNetTotal = invoice.lines.reduce((sum, line) => sum + line.netAmount.amount, 0)
      const expectedTaxTotal = invoice.lines.reduce((sum, line) => sum + line.taxAmount.amount, 0)
      const expectedGrossTotal = invoice.lines.reduce((sum, line) => sum + line.grossAmount.amount, 0)

      if (Math.abs(expectedNetTotal - invoice.totals.netTotal.amount) > 0.01) {
        errors.push('Net total calculation error')
      }
      if (Math.abs(expectedTaxTotal - invoice.totals.taxTotal.amount) > 0.01) {
        errors.push('Tax total calculation error')
      }
      if (Math.abs(expectedGrossTotal - invoice.totals.grossTotal.amount) > 0.01) {
        errors.push('Gross total calculation error')
      }
    }

    // Validate NIP format
    const sellerNip = invoice.header.seller.taxIdentifier.nip
    const buyerNip = invoice.header.buyer.taxIdentifier.nip

    if (sellerNip && !/^\d{10}$/.test(sellerNip)) {
      errors.push('Seller NIP must be 10 digits')
    }
    if (buyerNip && !/^\d{10}$/.test(buyerNip)) {
      errors.push('Buyer NIP must be 10 digits')
    }

    if (errors.length > 0) {
      throw new InvoiceValidationError(
        'Invoice structure validation failed',
        invoice.header.invoiceNumber,
        errors
      )
    }
  }
}
