import {
  Invoice,
  InvoiceHeader,
  InvoiceLine,
  InvoiceTotals,
  InvoiceType,
  Entity,
  InvoiceHeaderSchema,
  InvoiceLineSchema,
  InvoiceSchema,
} from '@/types/invoice'

export class EntityBuilder {
  private entity: Partial<Entity> = {}

  public withName(name: string): this {
    this.entity.name = name
    return this
  }

  public withAddress(
    street: string,
    houseNumber: string,
    city: string,
    postalCode: string,
    apartmentNumber?: string,
    country = 'PL'
  ): this {
    this.entity.address = {
      street,
      houseNumber,
      apartmentNumber,
      city,
      postalCode,
      country,
    }
    return this
  }

  public withTaxIdentifier(nip?: string, pesel?: string, regon?: string, vatId?: string): this {
    this.entity.taxIdentifier = { nip, pesel, regon, vatId }
    return this
  }

  public withNip(nip: string): this {
    this.entity.taxIdentifier = { ...this.entity.taxIdentifier, nip }
    return this
  }

  public withEmail(email: string): this {
    this.entity.email = email
    return this
  }

  public withPhone(phone: string): this {
    this.entity.phone = phone
    return this
  }

  public build(): Entity {
    if (!this.entity.name) {
      throw new Error('Entity name is required')
    }
    if (!this.entity.address) {
      throw new Error('Entity address is required')
    }
    if (!this.entity.taxIdentifier) {
      throw new Error('Entity tax identifier is required')
    }
    return this.entity as Entity
  }

  public static create(): EntityBuilder {
    return new EntityBuilder()
  }
}

export class InvoiceLineBuilder {
  private line: Partial<InvoiceLine> = {}

  public withLineNumber(lineNumber: number): this {
    this.line.lineNumber = lineNumber
    return this
  }

  public withProduct(name: string, code?: string): this {
    this.line.productName = name
    this.line.productCode = code
    return this
  }

  public withQuantity(quantity: number, unit = 'szt'): this {
    this.line.quantity = quantity
    this.line.unit = unit
    return this
  }

  public withUnitPrice(amount: number, currency = 'PLN'): this {
    this.line.unitPrice = { amount, currency }
    return this
  }

  public withNetAmount(amount: number, currency = 'PLN'): this {
    this.line.netAmount = { amount, currency }
    return this
  }

  public withTaxRate(rate: number, type: 'vat' | 'exempt' | 'zero' | 'np' = 'vat'): this {
    this.line.taxRate = { rate, type }
    return this
  }

  public withTaxAmount(amount: number, currency = 'PLN'): this {
    this.line.taxAmount = { amount, currency }
    return this
  }

  public withGrossAmount(amount: number, currency = 'PLN'): this {
    this.line.grossAmount = { amount, currency }
    return this
  }

  public withDiscount(discount: number): this {
    this.line.discount = discount
    return this
  }

  public calculateAmounts(): this {
    if (!this.line.unitPrice || !this.line.quantity || !this.line.taxRate) {
      throw new Error('Unit price, quantity, and tax rate are required for calculation')
    }

    const netAmount = this.line.unitPrice.amount * this.line.quantity
    const taxAmount = netAmount * this.line.taxRate.rate
    const grossAmount = netAmount + taxAmount

    this.line.netAmount = { amount: netAmount, currency: this.line.unitPrice.currency }
    this.line.taxAmount = { amount: taxAmount, currency: this.line.unitPrice.currency }
    this.line.grossAmount = { amount: grossAmount, currency: this.line.unitPrice.currency }

    return this
  }

  public build(): InvoiceLine {
    const result = InvoiceLineSchema.safeParse(this.line)
    if (!result.success) {
      throw new Error(`Invalid invoice line: ${result.error.message}`)
    }
    return result.data
  }

  public static create(): InvoiceLineBuilder {
    return new InvoiceLineBuilder()
  }
}

export class InvoiceHeaderBuilder {
  private header: Partial<InvoiceHeader> = {}

  public withInvoiceNumber(invoiceNumber: string): this {
    this.header.invoiceNumber = invoiceNumber
    return this
  }

  public withInvoiceType(invoiceType: InvoiceType): this {
    this.header.invoiceType = invoiceType
    return this
  }

  public withIssueDate(issueDate: string): this {
    this.header.issueDate = issueDate
    return this
  }

  public withSaleDate(saleDate: string): this {
    this.header.saleDate = saleDate
    return this
  }

  public withDueDate(dueDate?: string): this {
    this.header.dueDate = dueDate
    return this
  }

  public withCurrency(currency: string, exchangeRate?: number): this {
    this.header.currency = currency
    this.header.exchangeRate = exchangeRate
    return this
  }

  public withPaymentMethod(paymentMethod: string): this {
    this.header.paymentMethod = paymentMethod
    return this
  }

  public withSeller(seller: Entity): this {
    this.header.seller = seller
    return this
  }

  public withBuyer(buyer: Entity): this {
    this.header.buyer = buyer
    return this
  }

  public build(): InvoiceHeader {
    const result = InvoiceHeaderSchema.safeParse(this.header)
    if (!result.success) {
      throw new Error(`Invalid invoice header: ${result.error.message}`)
    }
    return result.data
  }

  public static create(): InvoiceHeaderBuilder {
    return new InvoiceHeaderBuilder()
  }
}

export class InvoiceBuilder {
  private invoice: Partial<Invoice> = {
    lines: [],
  }

  public withHeader(header: InvoiceHeader): this {
    this.invoice.header = header
    return this
  }

  public addLine(line: InvoiceLine): this {
    if (!this.invoice.lines) {
      this.invoice.lines = []
    }
    this.invoice.lines.push(line)
    return this
  }

  public addLines(lines: InvoiceLine[]): this {
    if (!this.invoice.lines) {
      this.invoice.lines = []
    }
    this.invoice.lines.push(...lines)
    return this
  }

  public withTotals(totals: InvoiceTotals): this {
    this.invoice.totals = totals
    return this
  }

  public calculateTotals(): this {
    if (!this.invoice.lines || this.invoice.lines.length === 0) {
      throw new Error('Cannot calculate totals without invoice lines')
    }

    const currency = this.invoice.lines[0]?.netAmount.currency ?? 'PLN'

    const netTotal = this.invoice.lines.reduce((sum, line) => sum + line.netAmount.amount, 0)
    const taxTotal = this.invoice.lines.reduce((sum, line) => sum + line.taxAmount.amount, 0)
    const grossTotal = this.invoice.lines.reduce((sum, line) => sum + line.grossAmount.amount, 0)

    this.invoice.totals = {
      netTotal: { amount: netTotal, currency },
      taxTotal: { amount: taxTotal, currency },
      grossTotal: { amount: grossTotal, currency },
    }

    return this
  }

  public withNotes(notes: string): this {
    this.invoice.notes = notes
    return this
  }

  public withAttachments(attachments: string[]): this {
    this.invoice.attachments = attachments
    return this
  }

  public addAttachment(attachment: string): this {
    if (!this.invoice.attachments) {
      this.invoice.attachments = []
    }
    this.invoice.attachments.push(attachment)
    return this
  }

  public build(): Invoice {
    if (this.invoice.lines && this.invoice.lines.length > 0) {
      this.invoice.lines = this.invoice.lines.map((line, index) => (
        line.lineNumber === undefined ? { ...line, lineNumber: index + 1 } : line
      ))
    }

    // Auto-calculate totals if not provided
    if (!this.invoice.totals && this.invoice.lines && this.invoice.lines.length > 0) {
      this.calculateTotals()
    }

    const result = InvoiceSchema.safeParse(this.invoice)
    if (!result.success) {
      throw new Error(`Invalid invoice: ${result.error.message}`)
    }
    return result.data
  }

  public static create(): InvoiceBuilder {
    return new InvoiceBuilder()
  }

  public static withNumber(invoiceNumber: string): InvoiceBuilder {
    return new InvoiceBuilder().withHeader(
      InvoiceHeaderBuilder.create().withInvoiceNumber(invoiceNumber).build()
    )
  }
}

// Convenience builders for common scenarios
export class SimpleInvoiceBuilder {
  public static vatInvoice(
    invoiceNumber: string,
    issueDate: string,
    seller: Entity,
    buyer: Entity
  ): InvoiceBuilder {
    const header = InvoiceHeaderBuilder.create()
      .withInvoiceNumber(invoiceNumber)
      .withInvoiceType(InvoiceType.FA_VAT)
      .withIssueDate(issueDate)
      .withSaleDate(issueDate)
      .withSeller(seller)
      .withBuyer(buyer)
      .build()

    return InvoiceBuilder.create().withHeader(header)
  }

  public static simpleVatLine(
    lineNumber: number,
    productName: string,
    quantity: number,
    unitPrice: number,
    vatRate?: number
  ): InvoiceLine
  public static simpleVatLine(
    productName: string,
    quantity: number,
    unitPrice: number,
    vatRate?: number,
    lineNumber?: number
  ): InvoiceLine
  public static simpleVatLine(
    arg1: number | string,
    arg2: string | number,
    arg3: number,
    arg4: number,
    arg5?: number,
    arg6?: number
  ): InvoiceLine {
    let lineNumber: number | undefined
    let productName: string
    let quantity: number
    let unitPrice: number
    let vatRate = 0.23

    if (typeof arg1 === 'number') {
      lineNumber = arg1
      productName = String(arg2)
      quantity = arg3
      unitPrice = arg4
      if (arg5 !== undefined) vatRate = arg5
    } else {
      productName = arg1
      quantity = arg2 as number
      unitPrice = arg3
      if (arg4 !== undefined) vatRate = arg4
      if (arg5 !== undefined) lineNumber = arg5
      if (arg6 !== undefined) lineNumber = arg6
    }

    const builder = InvoiceLineBuilder.create()
    if (lineNumber !== undefined) {
      builder.withLineNumber(lineNumber)
    }

    return builder
      .withProduct(productName)
      .withQuantity(quantity)
      .withUnitPrice(unitPrice)
      .withTaxRate(vatRate, 'vat')
      .calculateAmounts()
      .build()
  }
}
