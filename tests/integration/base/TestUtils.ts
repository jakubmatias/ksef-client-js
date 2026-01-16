export class TestUtils {
  /**
   * Generate a random valid Polish NIP (tax identification number)
   * Equivalent to Java's generateRandomNIP()
   */
  public generateRandomNIP(): string {
    // Generate 9 random digits
    const digits: number[] = []
    for (let i = 0; i < 9; i++) {
      digits.push(Math.floor(Math.random() * 10))
    }

    // Calculate checksum digit using Polish NIP algorithm
    const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
    let sum = 0

    for (let i = 0; i < 9; i++) {
      sum += digits[i]! * weights[i]!
    }

    const checksum = sum % 11
    if (checksum === 10) {
      // If checksum is 10, regenerate (invalid NIP)
      return this.generateRandomNIP()
    }

    digits.push(checksum)
    return digits.join('')
  }

  /**
   * Generate a random valid EU VAT number
   * Equivalent to Java's generateRandomVatEu()
   */
  public generateRandomVatEu(): string {
    // Generate a random EU country code and VAT number
    const euCountries = ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'SE', 'DK', 'FI']
    const country = euCountries[Math.floor(Math.random() * euCountries.length)]

    // Generate VAT number based on country
    switch (country) {
      case 'DE':
        return `DE${this.generateRandomDigits(9)}`
      case 'FR':
        return `FR${this.generateRandomAlphaNumeric(2)}${this.generateRandomDigits(9)}`
      case 'IT':
        return `IT${this.generateRandomDigits(11)}`
      case 'ES':
        return `ES${this.generateRandomAlphaNumeric(1)}${this.generateRandomDigits(7)}${this.generateRandomAlphaNumeric(1)}`
      case 'NL':
        return `NL${this.generateRandomDigits(9)}B${this.generateRandomDigits(2)}`
      case 'BE':
        return `BE0${this.generateRandomDigits(9)}`
      case 'AT':
        return `ATU${this.generateRandomDigits(8)}`
      case 'SE':
        return `SE${this.generateRandomDigits(12)}`
      case 'DK':
        return `DK${this.generateRandomDigits(8)}`
      case 'FI':
        return `FI${this.generateRandomDigits(8)}`
      default:
        return `${country}${this.generateRandomDigits(8)}`
    }
  }

  /**
   * Create invoice data from template with placeholder replacement
   */
  public createInvoiceFromTemplate(
    template: 'fa2' | 'fa3',
    nip: string,
    invoiceNumber: string
  ): any {
    const baseInvoice = template === 'fa3' ? this.getFA3Template() : this.getFA2Template()

    // Replace placeholders
    const invoiceData = this.deepClone(baseInvoice)
    this.replacePlaceholders(invoiceData, {
      '#nip#': nip,
      '#invoice_number#': invoiceNumber,
    })

    return invoiceData
  }

  /**
   * Get FA_2 invoice template (equivalent to Java's invoice-template.xml)
   */
  private getFA2Template(): any {
    return {
      header: {
        invoiceNumber: '#invoice_number#',
        invoiceType: 'FA_VAT',
        issueDate: new Date().toISOString().split('T')[0],
        saleDate: new Date().toISOString().split('T')[0],
        currency: 'PLN',
        seller: {
          name: 'Test Seller Company',
          address: {
            street: 'Test Street',
            houseNumber: '1',
            apartmentNumber: '2',
            city: 'Warsaw',
            postalCode: '00-001',
            country: 'PL',
          },
          taxIdentifier: {
            nip: '#nip#',
          },
          email: 'seller@test.com',
          phone: '+48123456789',
        },
        buyer: {
          name: 'Test Buyer Company',
          address: {
            street: 'Buyer Street',
            houseNumber: '10',
            city: 'Krakow',
            postalCode: '30-001',
            country: 'PL',
          },
          taxIdentifier: {
            nip: '9876543210',
          },
          email: 'buyer@test.com',
        },
        paymentMethod: 'TRANSFER',
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      },
      lines: [
        {
          lineNumber: 1,
          productName: 'Test Product 1',
          productCode: 'PROD001',
          quantity: 2,
          unit: 'szt',
          unitPrice: {
            amount: 100.00,
            currency: 'PLN',
          },
          netAmount: {
            amount: 200.00,
            currency: 'PLN',
          },
          taxRate: {
            rate: 0.23,
            type: 'vat',
          },
          taxAmount: {
            amount: 46.00,
            currency: 'PLN',
          },
          grossAmount: {
            amount: 246.00,
            currency: 'PLN',
          },
        },
        {
          lineNumber: 2,
          productName: 'Test Product 2',
          productCode: 'PROD002',
          quantity: 1,
          unit: 'szt',
          unitPrice: {
            amount: 150.00,
            currency: 'PLN',
          },
          netAmount: {
            amount: 150.00,
            currency: 'PLN',
          },
          taxRate: {
            rate: 0.23,
            type: 'vat',
          },
          taxAmount: {
            amount: 34.50,
            currency: 'PLN',
          },
          grossAmount: {
            amount: 184.50,
            currency: 'PLN',
          },
        },
      ],
      totals: {
        netTotal: {
          amount: 350.00,
          currency: 'PLN',
        },
        taxTotal: {
          amount: 80.50,
          currency: 'PLN',
        },
        grossTotal: {
          amount: 430.50,
          currency: 'PLN',
        },
      },
      notes: 'Test invoice generated for integration testing',
    }
  }

  /**
   * Get FA_3 invoice template (equivalent to Java's invoice-template_v3.xml)
   */
  private getFA3Template(): any {
    const fa2Template = this.getFA2Template()

    // FA_3 template has additional fields and structure
    return {
      ...fa2Template,
      header: {
        ...fa2Template.header,
        invoiceType: 'FA_VAT',
        // Additional FA_3 fields
        documentNumber: '#invoice_number#',
        documentDate: new Date().toISOString().split('T')[0],
        salesChannel: 'ONLINE',
        paymentTerms: 'NET_30',
        // Enhanced seller information for FA_3
        seller: {
          ...fa2Template.header.seller,
          regon: '123456789',
          krs: '0000123456',
          website: 'https://test-seller.com',
        },
        // Enhanced buyer information for FA_3
        buyer: {
          ...fa2Template.header.buyer,
          regon: '987654321',
        },
      },
      // Additional FA_3 specific sections
      delivery: {
        deliveryDate: new Date().toISOString().split('T')[0],
        deliveryAddress: {
          street: 'Delivery Street',
          houseNumber: '5',
          city: 'Gdansk',
          postalCode: '80-001',
          country: 'PL',
        },
      },
      transport: {
        transportMethod: 'ROAD',
        carrier: {
          name: 'Test Transport Company',
          nip: '1111111111',
        },
      },
    }
  }

  /**
   * Generate random digits string
   */
  private generateRandomDigits(length: number): string {
    let result = ''
    for (let i = 0; i < length; i++) {
      result += Math.floor(Math.random() * 10)
    }
    return result
  }

  /**
   * Generate random alphanumeric string
   */
  private generateRandomAlphaNumeric(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  /**
   * Deep clone object
   */
  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj))
  }

  /**
   * Replace placeholders in object recursively
   */
  private replacePlaceholders(obj: any, replacements: Record<string, string>): void {
    if (typeof obj === 'string') {
      return
    }

    if (Array.isArray(obj)) {
      obj.forEach(item => this.replacePlaceholders(item, replacements))
      return
    }

    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          for (const [placeholder, replacement] of Object.entries(replacements)) {
            obj[key] = obj[key].replace(new RegExp(placeholder, 'g'), replacement)
          }
        } else {
          this.replacePlaceholders(obj[key], replacements)
        }
      }
    }
  }

  /**
   * Generate test reference number
   */
  public generateReferenceNumber(prefix: string = 'REF'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Create test file content for batch processing
   */
  public createTestFileContent(invoices: any[]): Buffer {
    const content = JSON.stringify({
      invoices,
      metadata: {
        created: new Date().toISOString(),
        count: invoices.length,
      },
    })
    return Buffer.from(content, 'utf-8')
  }

  /**
   * Generate test encryption key
   */
  public generateTestEncryptionKey(): Uint8Array {
    const key = new Uint8Array(32) // 256-bit key
    crypto.getRandomValues(key)
    return key
  }

  /**
   * Simple AES encryption simulation for tests
   */
  public async encryptTestData(data: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
    // This is a simplified encryption for testing purposes
    // In real implementation, this would use proper AES encryption
    const encrypted = new Uint8Array(data.length)
    for (let i = 0; i < data.length; i++) {
      encrypted[i] = data[i]! ^ key[i % key.length]!
    }
    return encrypted
  }

  /**
   * Create ZIP-like structure for batch testing
   */
  public createBatchZipStructure(files: Array<{ name: string; content: Buffer }>): Buffer {
    // Simplified ZIP structure for testing
    // In real implementation, this would create actual ZIP files
    const structure = {
      files: files.map(file => ({
        name: file.name,
        size: file.content.length,
        content: file.content.toString('base64'),
      })),
      created: new Date().toISOString(),
    }

    return Buffer.from(JSON.stringify(structure), 'utf-8')
  }

  /**
   * Generate invoice XML from invoice data
   */
  public generateInvoiceXml(invoiceData: any): string {
    const {
      invoiceNumber,
      issueDate,
      sellerNip,
      buyerNip,
      netAmount,
      vatAmount,
      grossAmount,
      currency = 'PLN',
      correctionReason,
      originalInvoiceNumber,
      invoiceType = 'standard',
      paymentMethod = 'transfer',
      paymentDueDate,
    } = invoiceData

    const isCorrection = invoiceType === 'corrective' || correctionReason
    const vatRate = netAmount > 0 ? (vatAmount / netAmount) : 0.23

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="http://ksef.gov.pl/schema/fa/2021/06/21/invoice">
  <InvoiceHeader>
    <InvoiceNumber>${invoiceNumber}</InvoiceNumber>
    <InvoiceIssueDate>${issueDate}</InvoiceIssueDate>
    <InvoiceTypeCode>${isCorrection ? 'CORRECTION' : 'ORIGINAL'}</InvoiceTypeCode>
    ${isCorrection && originalInvoiceNumber ? `<OriginalInvoiceNumber>${originalInvoiceNumber}</OriginalInvoiceNumber>` : ''}
    ${isCorrection && correctionReason ? `<CorrectionReason>${correctionReason}</CorrectionReason>` : ''}
    <CurrencyCode>${currency}</CurrencyCode>
    ${paymentMethod ? `<PaymentMethod>${paymentMethod.toUpperCase()}</PaymentMethod>` : ''}
    ${paymentDueDate ? `<PaymentDueDate>${paymentDueDate}</PaymentDueDate>` : ''}
  </InvoiceHeader>
  <InvoiceSubject>
    <SubjectTo>
      <SubjectName>Buyer Company</SubjectName>
      <SubjectAddress>
        <StreetName>Test Street</StreetName>
        <BuildingNumber>1</BuildingNumber>
        <CityName>Warsaw</CityName>
        <PostalZone>00-001</PostalZone>
        <Country>PL</Country>
      </SubjectAddress>
      <SubjectIdentifier>
        <NIP>${buyerNip}</NIP>
      </SubjectIdentifier>
    </SubjectTo>
    <SubjectBy>
      <SubjectName>Seller Company</SubjectName>
      <SubjectAddress>
        <StreetName>Seller Street</StreetName>
        <BuildingNumber>10</BuildingNumber>
        <CityName>Krakow</CityName>
        <PostalZone>30-001</PostalZone>
        <Country>PL</Country>
      </SubjectAddress>
      <SubjectIdentifier>
        <NIP>${sellerNip}</NIP>
      </SubjectIdentifier>
    </SubjectBy>
  </InvoiceSubject>
  <InvoiceDetail>
    <InvoiceLine>
      <InvoiceLineNumber>1</InvoiceLineNumber>
      <ItemName>Test Product</ItemName>
      <InvoicedQuantity unitCode="H87">1</InvoicedQuantity>
      <LineNetAmount currencyID="${currency}">${netAmount.toFixed(2)}</LineNetAmount>
      <TaxScheme>
        <TaxAmount currencyID="${currency}">${vatAmount.toFixed(2)}</TaxAmount>
        <TaxPercent>${(vatRate * 100).toFixed(0)}</TaxPercent>
      </TaxScheme>
      <LineGrossAmount currencyID="${currency}">${grossAmount.toFixed(2)}</LineGrossAmount>
    </InvoiceLine>
  </InvoiceDetail>
  <InvoiceSummary>
    <TotalNetAmount currencyID="${currency}">${netAmount.toFixed(2)}</TotalNetAmount>
    <TotalTaxAmount currencyID="${currency}">${vatAmount.toFixed(2)}</TotalTaxAmount>
    <TotalGrossAmount currencyID="${currency}">${grossAmount.toFixed(2)}</TotalGrossAmount>
  </InvoiceSummary>
</Invoice>`
  }

  /**
   * Generate correction invoice XML
   */
  public generateCorrectionInvoiceXml(invoiceData: any): string {
    return this.generateInvoiceXml({
      ...invoiceData,
      invoiceType: 'corrective',
    })
  }

  /**
   * Calculate XML hash for invoice validation
   */
  public calculateXmlHash(xmlContent: string): string {
    // Simple hash calculation for testing purposes
    // In real implementation, this would use proper cryptographic hashing
    let hash = 0
    for (let i = 0; i < xmlContent.length; i++) {
      const char = xmlContent.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16)
  }

  /**
   * Generate mock file data for attachments
   */
  public generateMockFileData(type: string, sizeBytes: number): Uint8Array {
    const data = new Uint8Array(sizeBytes)

    // Fill with pattern based on file type
    if (type === 'pdf') {
      // PDF header magic bytes
      const pdfHeader = '%PDF-1.4\n'
      for (let i = 0; i < Math.min(pdfHeader.length, sizeBytes); i++) {
        data[i] = pdfHeader.charCodeAt(i)
      }
    } else if (type === 'jpg') {
      // JPEG header magic bytes
      data[0] = 0xFF
      data[1] = 0xD8
      data[2] = 0xFF
      data[3] = 0xE0
    }

    // Fill rest with random data
    for (let i = 4; i < sizeBytes; i++) {
      data[i] = Math.floor(Math.random() * 256)
    }

    return data
  }
}