import { z } from 'zod'

// Invoice types supported by KSEF
export enum InvoiceType {
  FA_VAT = 'FA_VAT', // VAT invoice
  RO = 'RO', // Internal document
  WEW = 'WEW', // Internal invoice
}

// Invoice status enum
export enum InvoiceStatus {
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  PROCESSING = 'processing',
  PENDING = 'pending',
}

// Invoice submission result enum
export enum SubmissionResult {
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
}

// Money amount schema (with currency)
export const MoneyAmountSchema = z.object({
  amount: z.number().multipleOf(0.01), // 2 decimal places
  currency: z.string().length(3).default('PLN'),
})

export type MoneyAmount = z.infer<typeof MoneyAmountSchema>

// Address schema
export const AddressSchema = z.object({
  street: z.string().min(1).max(100),
  houseNumber: z.string().min(1).max(20),
  apartmentNumber: z.string().max(20).optional(),
  city: z.string().min(1).max(50),
  postalCode: z.string().regex(/^\d{2}-\d{3}$/, 'Postal code must match XX-XXX format'),
  country: z.string().length(2).default('PL'), // ISO 3166-1 alpha-2
})

export type Address = z.infer<typeof AddressSchema>

// Tax identifier schema
export const TaxIdentifierSchema = z.object({
  nip: z.string().regex(/^\d{10}$/, 'NIP must be 10 digits').optional(),
  pesel: z.string().regex(/^\d{11}$/, 'PESEL must be 11 digits').optional(),
  regon: z.string().regex(/^\d{9}(\d{5})?$/, 'REGON must be 9 or 14 digits').optional(),
  vatId: z.string().optional(), // EU VAT ID for foreign entities
})

export type TaxIdentifier = z.infer<typeof TaxIdentifierSchema>

// Entity schema (buyer/seller)
export const EntitySchema = z.object({
  name: z.string().min(1).max(200),
  address: AddressSchema,
  taxIdentifier: TaxIdentifierSchema,
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
})

export type Entity = z.infer<typeof EntitySchema>

// Tax rate schema
export const TaxRateSchema = z.object({
  rate: z.number().min(0).max(1), // 0.23 for 23% VAT
  type: z.enum(['vat', 'exempt', 'zero', 'np']), // np = not subject to VAT
})

export type TaxRate = z.infer<typeof TaxRateSchema>

// Invoice line item schema
export const InvoiceLineSchema = z.object({
  lineNumber: z.number().int().min(1).optional(),
  productName: z.string().min(1).max(500),
  productCode: z.string().max(50).optional(),
  quantity: z.number().positive(),
  unit: z.string().max(20).default('szt'), // pieces
  unitPrice: MoneyAmountSchema,
  netAmount: MoneyAmountSchema,
  taxRate: TaxRateSchema,
  taxAmount: MoneyAmountSchema,
  grossAmount: MoneyAmountSchema,
  discount: z.number().min(0).max(1).optional(), // Percentage discount
})

export type InvoiceLine = z.infer<typeof InvoiceLineSchema>

// Invoice totals schema
export const InvoiceTotalsSchema = z.object({
  netTotal: MoneyAmountSchema,
  taxTotal: MoneyAmountSchema,
  grossTotal: MoneyAmountSchema,
  discount: MoneyAmountSchema.optional(),
})

export type InvoiceTotals = z.infer<typeof InvoiceTotalsSchema>

// Invoice header schema
export const InvoiceHeaderSchema = z.object({
  invoiceNumber: z.string().min(1).max(50),
  invoiceType: z.nativeEnum(InvoiceType),
  issueDate: z.string().date(),
  saleDate: z.string().date(),
  dueDate: z.string().date().optional(),
  currency: z.string().length(3).default('PLN'),
  exchangeRate: z.number().positive().optional(),
  paymentMethod: z.string().max(100).optional(),
  seller: EntitySchema,
  buyer: EntitySchema,
})

export type InvoiceHeader = z.infer<typeof InvoiceHeaderSchema>

// Complete invoice schema
export const InvoiceSchema = z.object({
  header: InvoiceHeaderSchema,
  lines: z.array(InvoiceLineSchema).min(1),
  totals: InvoiceTotalsSchema,
  notes: z.string().max(1000).optional(),
  attachments: z.array(z.string()).optional(), // Base64 encoded attachments
})

export type Invoice = z.infer<typeof InvoiceSchema>

// Invoice submission request schema
export const InvoiceSubmissionRequestSchema = z.object({
  sessionId: z.string(),
  invoice: InvoiceSchema,
  validateOnly: z.boolean().optional().default(false),
})

export type InvoiceSubmissionRequest = z.infer<typeof InvoiceSubmissionRequestSchema>

// Invoice submission response schema
export const InvoiceSubmissionResponseSchema = z.object({
  sessionId: z.string(),
  invoiceReferenceNumber: z.string(),
  ksefReferenceNumber: z.string().optional(),
  result: z.nativeEnum(SubmissionResult),
  status: z.nativeEnum(InvoiceStatus),
  timestamp: z.string().datetime(),
  validationMessages: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  errors: z.array(z.string()).optional(),
})

export type InvoiceSubmissionResponse = z.infer<typeof InvoiceSubmissionResponseSchema>

// Invoice query filters schema
export const InvoiceQueryFiltersSchema = z.object({
  fromDate: z.string().date().optional(),
  toDate: z.string().date().optional(),
  nip: z.string().regex(/^\d{10}$/).optional(),
  invoiceNumber: z.string().optional(),
  ksefReferenceNumber: z.string().optional(),
  status: z.nativeEnum(InvoiceStatus).optional(),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  limit: z.number().int().min(1).max(1000).optional().default(100),
  offset: z.number().int().min(0).optional().default(0),
})

export type InvoiceQueryFilters = z.infer<typeof InvoiceQueryFiltersSchema>

// Invoice query response schema
export const InvoiceQueryResponseSchema = z.object({
  invoices: z.array(
    z.object({
      ksefReferenceNumber: z.string(),
      invoiceNumber: z.string(),
      issueDate: z.string().date(),
      seller: z.object({
        name: z.string(),
        nip: z.string(),
      }),
      buyer: z.object({
        name: z.string(),
        nip: z.string().optional(),
      }),
      grossTotal: MoneyAmountSchema,
      status: z.nativeEnum(InvoiceStatus),
    })
  ),
  totalCount: z.number().int().min(0),
  hasMore: z.boolean(),
})

export type InvoiceQueryResponse = z.infer<typeof InvoiceQueryResponseSchema>

// Invoice download response schema
export const InvoiceDownloadResponseSchema = z.object({
  ksefReferenceNumber: z.string(),
  invoiceData: z.string(), // Base64 encoded invoice XML
  format: z.enum(['xml', 'pdf']),
  timestamp: z.string().datetime(),
})

export type InvoiceDownloadResponse = z.infer<typeof InvoiceDownloadResponseSchema>

// Invoice error classes
export class InvoiceError extends Error {
  public readonly code: string
  public readonly invoiceNumber?: string | undefined
  public readonly details?: unknown | undefined

  constructor(message: string, code: string, invoiceNumber?: string | undefined, details?: unknown) {
    super(message)
    this.name = 'InvoiceError'
    this.code = code
    this.invoiceNumber = invoiceNumber
    this.details = details
  }
}

export class InvoiceValidationError extends InvoiceError {
  public readonly validationErrors: string[]

  constructor(message: string, invoiceNumber: string, errors: string[]) {
    super(message, 'VALIDATION_ERROR', invoiceNumber, { validationErrors: errors })
    this.name = 'InvoiceValidationError'
    this.validationErrors = errors
  }
}
