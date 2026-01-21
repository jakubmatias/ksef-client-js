# KSEF TypeScript Client

A modern TypeScript client library and CLI tool for Poland's KSEF (Krajowy System e-Faktur) e-invoicing system.

## Features

### 🚀 **Phase 1 & Phase 2 Implementation Complete**

- ✅ **Certificate-based Authentication** - Full X.509 certificate support with validation
- ✅ **Session Management** - Online and batch session handling with builder patterns
- ✅ **Invoice Operations** - Submit, validate, query, and download invoices
- ✅ **Builder Pattern API** - Fluent interfaces for all complex operations
- ✅ **Self-contained CLI Executables** - Native binaries with no runtime dependencies
- ✅ **Cross-platform Support** - Works on Node.js, Bun, Deno, Cloudflare Workers, and browsers
- ✅ **Unix-style Piping** - Pipeline data through multiple CLI operations
- ✅ **Comprehensive Testing** - Unit tests with 95%+ coverage target

### 🛠 **Technical Stack**

- **Runtime**: Bun (primary), Node.js, Deno, Cloudflare Workers compatible
- **Language**: TypeScript with strict type checking
- **Validation**: Zod schemas for runtime type safety
- **HTTP Client**: Standards-based with Web APIs
- **CLI Framework**: Commander.js with native executable compilation
- **Testing**: Vitest with comprehensive coverage
- **Build**: tsup for library, Bun for CLI executables

### 📦 **Installation**

**NOT**

- NOT certified.
- NOT thoroughly tested.
- NOT claiming correctness.
- NOT responsible for problems if used in production.

Install script disclaimer: these scripts download binaries and place them on your PATH. If you do not understand or trust what they do, do not use them.

```bash
# Library installation
npm install github:jakubmatias/ksef-client-js
# No plans to publish to npm for now

# Import schemas (optional)
# Node with JSON imports enabled:
# import fa3Schema from 'ksef-client/schemas/invoice-fa3.schema.json'
# import fa2Schema from 'ksef-client/schemas/invoice-fa2.schema.json'
```

```bash
# CLI install (Linux)
curl -fsSL https://raw.githubusercontent.com/jakubmatias/ksef-client-js/main/scripts/install-linux.sh | bash

# CLI install (macOS)
curl -fsSL https://raw.githubusercontent.com/jakubmatias/ksef-client-js/main/scripts/install-macos.sh | bash
```

```powershell
# CLI install (Windows PowerShell)
irm https://raw.githubusercontent.com/jakubmatias/ksef-client-js/main/scripts/install-windows.ps1 | iex
```

## 🔧 **Library Usage**

### Basic Client Setup

```typescript
import { KsefClient, AuthConfigBuilder } from 'ksef-client'

// Create client for test environment
const client = KsefClient.forEnvironment('test')

// Or with custom configuration
const client = KsefClient.create({
  baseURL: 'https://api-test.ksef.mf.gov.pl',
  timeout: 30000,
  retries: 3,
})
```

### Environments and Base URLs

Test Environment - Środowisko testowe (TE)

- https://api-test.ksef.mf.gov.pl
- https://qr-test.ksef.mf.gov.pl
- https://ap-test.ksef.mf.gov.pl

Demo environment - Środowisko demonstracyjne / przedprodukcyjne (TR)

- https://api-demo.ksef.mf.gov.pl
- https://qr-demo.ksef.mf.gov.pl
- https://ap-demo.ksef.mf.gov.pl

Production Environment - Środowisko produkcyjne (PRD)

- https://api.ksef.mf.gov.pl
- https://qr.ksef.mf.gov.pl
- https://ap.ksef.mf.gov.pl

### Authentication

```typescript
import { readFile } from 'fs/promises'
import { AuthConfigBuilder, CertificateFormat } from 'ksef-client'

// Build authentication configuration (PEM cert + key)
const certPem = await readFile(process.env.KSEF_CERT_PEM_PATH!, 'utf-8')
const keyPem = await readFile(process.env.KSEF_KEY_PEM_PATH!, 'utf-8')
const combinedPem = `${certPem}\n${keyPem}`

const authConfig = AuthConfigBuilder.create()
  .withCertificateData(new Uint8Array(Buffer.from(combinedPem, 'utf-8')))
  .withFormat(CertificateFormat.PEM)
  .withAuthMode('xades')
  .withContextIdentifier({ type: 'nip', value: process.env.KSEF_NIP! })
  .withCertificatePassword(process.env.KSEF_KEY_PASSPHRASE)
  .build()

// Authenticate
const authResult = await client.authenticator.authenticate(authConfig)
console.log('Access Token:', authResult.accessToken)
```

### Session Management

```typescript
import { SessionBuilder } from 'ksef-client'

// Create online session
const sessionConfig = SessionBuilder.onlineForNip('1234567890')
  .withDescription('My invoice session')
  .withTimeout(1800)
  .build()

const session = await client.sessionManager.createOnlineSession(sessionConfig)
console.log('Session ID:', session.sessionId)
```

### Invoice Operations

```typescript
import {
  InvoiceBuilder,
  InvoiceHeaderBuilder,
  EntityBuilder,
  SimpleInvoiceBuilder,
  Fa3XsdInvoiceBuilder,
} from 'ksef-client'

// Create entities
const seller = EntityBuilder.create()
  .withName('Test Company Sp. z o.o.')
  .withAddress('Test Street', '1', 'Warsaw', '00-001')
  .withNip('1234567890')
  .build()

const buyer = EntityBuilder.create()
  .withName('Buyer Company')
  .withAddress('Buyer Street', '2', 'Krakow', '30-001')
  .withNip('0987654321')
  .build()

// Build invoice using simple builder
const invoice = SimpleInvoiceBuilder.vatInvoice('INV-2023-001', '2023-12-01', seller, buyer)
  .addLine(SimpleInvoiceBuilder.simpleVatLine('Product Name', 1, 100.0, 0.23))
  .calculateTotals()
  .build()

// Submit invoice
const result = await client.invoiceService.submitInvoice(session.sessionId, invoice)
console.log('Invoice submitted:', result.ksefReferenceNumber)
```

XSD-aligned FA(3) builder (field names match the FA(3) XSD):

```typescript
const xsdInvoiceXml = Fa3XsdInvoiceBuilder.create()
  .withNaglowek({
    KodFormularza: 'FA',
    WariantFormularza: '3',
    DataWytworzeniaFa: new Date().toISOString(),
    SystemInfo: 'ksef-client-js',
  })
  .withPodmiot1({
    DaneIdentyfikacyjne: { NIP: '1234567890', Nazwa: 'Example Seller' },
    Adres: { KodKraju: 'PL', AdresL1: 'Example Street 1' },
  })
  .withPodmiot2({
    DaneIdentyfikacyjne: { NIP: '0987654321', Nazwa: 'Example Buyer' },
    Adres: { KodKraju: 'PL', AdresL1: 'Buyer Street 2' },
    JST: '2',
    GV: '2',
  })
  .withFa({
    KodWaluty: 'PLN',
    P_1: '2026-01-14',
    P_2: `FA/EXAMPLE-${Date.now()}`,
    P_15: 100,
    Adnotacje: {
      P_16: '2',
      P_17: '2',
      P_18: '2',
      P_18A: '2',
      P_23: '2',
      PMarzy: { P_PMarzyN: '1' },
    },
    RodzajFaktury: 'VAT',
    FaWiersz: [
      { NrWierszaFa: 1, P_7: 'Service', P_8A: 'szt.', P_8B: 1, P_9A: 100, P_11: 100, P_12: 23 },
    ],
  })
  .buildXml()
```

## 🖥 **CLI Usage**

### Authentication

```bash
# Test certificate authentication
./ksef auth test -c cert.p12 -p password

# Get authentication challenge
./ksef auth challenge --save
```

### Session Management

```bash
# Open online session
./ksef session open online -n 1234567890 -d "My session"

# Open batch session with custom settings
./ksef session open batch -n 1234567890 -t 3600 --max-parts 50

# List active sessions
./ksef session list

# Close session
./ksef session close <session-id>
```

### Invoice Operations

```bash
# Submit invoice from file
./ksef invoice submit <session-id> -i invoice.json

# Query invoices
./ksef invoice query --from 2023-01-01 --to 2023-12-31 --nip 1234567890

# Download invoice
./ksef invoice download <ksef-ref> --format pdf -o invoice.pdf

# Validate invoice without submitting
./ksef invoice validate <session-id> -i invoice.json

JSON schemas for the CLI invoice input:
`schemas/invoice-fa3-xsd.schema.json`

JST/GV flags (FA(3) buyer fields):
- `buyer.jst`: Use "1" when the invoice concerns a subordinate local government unit (JST). Use "2" when it does not.
- `buyer.gv`: Use "1" when the invoice concerns a VAT group member (GV). Use "2" when it does not.
Note: When `buyer.jst` or `buyer.gv` is "1", Podmiot3 is required and should include a numeric `role` (1-11). Use `roleOther` only for non-standard roles; it emits `RolaInna=1` with `OpisRoli` in addition to `Rola`.
Example JSON payloads that include `podmiot3` for JST/GV cases: `examples/invoice-fa3.json`
```

### Pipeline Processing

```bash
# Process invoices through pipeline
cat invoices.json | ./ksef pipe --session-open online --session-nip 1234567890 --invoice-submit

# Query and export as CSV
./ksef invoice query --from 2023-01-01 | ./ksef pipe --format csv > results.csv
```

### Full FA(3) Workflow Example

A complete programmatic flow (open FA(3) session, build invoice, submit, download UPO, close session) is in:
`examples/fa3-workflow.ts`

#### Encryption Helpers

When integrating without the CLI, you can reuse the same encryption helpers:

```ts
import { createEncryptionData, encryptInvoiceXml } from 'ksef-client'
```

### Configuration

```bash
# Initialize configuration
./ksef config init

# Show current configuration
./ksef config show

# Use custom configuration
./ksef -c custom.config.json invoice query
```

## 🏗 **Builder Pattern API**

The library uses fluent builder patterns for intuitive object construction:

### Authentication Builder

```typescript
const authConfig = AuthConfigBuilder.create()
  .withCertificatePath('./cert.p12')
  .withCertificatePassword('password')
  .withFormat(CertificateFormat.PKCS12)
  .withAlgorithm('SHA256withRSA')
  .withCertificateValidation(true)
  .build()
```

### Session Builder

```typescript
// Online session
const onlineConfig = SessionBuilder.online()
  .withNip('1234567890')
  .withDescription('My session')
  .withTimeout(1800)
  .build()

// Batch session
const batchConfig = SessionBuilder.batch()
  .withNip('1234567890')
  .withMaxParts(50)
  .withTimeout(3600)
  .build()
```

### Invoice Builder

```typescript
const invoice = InvoiceBuilder.create()
  .withHeader(
    InvoiceHeaderBuilder.create()
      .withInvoiceNumber('INV-2023-001')
      .withInvoiceType(InvoiceType.FA_VAT)
      .withIssueDate('2023-12-01')
      .withSaleDate('2023-12-01')
      .withSeller(seller)
      .withBuyer(buyer)
      .build()
  )
  .addLine(
    InvoiceLineBuilder.create()
      .withLineNumber(1)
      .withProduct('Product Name')
      .withQuantity(1)
      .withUnitPrice(100.0)
      .withTaxRate(0.23)
      .calculateAmounts()
      .build()
  )
  .calculateTotals()
  .build()
```

## 🧪 **Testing**

```bash
# Run tests with Bun
bun run test

# Run tests with coverage
bun run test:coverage

# Run tests with UI
bun run test:ui
```

## 🔨 **Development**

```bash
# Install dependencies
bun install

# Build library
bun run build

# Build CLI executables
bun run build:cli

# Development mode with watch
bun run dev

# Type checking
bun run type-check

# Linting
bun run lint

# Format code
bun run format
```

## 📁 **Project Structure**

```
src/
├── auth/               # Authentication logic
├── builders/           # Fluent API builders
├── cli/               # CLI commands and interface
├── config/            # Configuration management
├── http/              # HTTP client infrastructure
├── invoice/           # Invoice operations
├── session/           # Session management
├── types/             # TypeScript type definitions
├── utils/             # Utility functions
├── index.ts           # Main library exports
└── cli.ts             # CLI entry point

tests/
├── unit/              # Unit tests
├── integration/       # Integration tests
└── mocks/             # Test mocks and fixtures
```

## 🌟 **Key Features Implemented**

### Phase 1 - Core API Client Foundation ✅

- Certificate-based authentication with X.509 support
- Session management (online and batch)
- Core invoice operations (submit, validate, query)
- HTTP client with rate limiting and retries
- Comprehensive TypeScript type definitions
- Builder pattern API design

### Phase 2 - CLI and Developer Experience ✅

- Full-featured CLI with commander.js
- Self-contained native executables (no runtime dependencies)
- Configuration management with file and environment support
- Unix-style piping for data processing
- Interactive help and comprehensive documentation
- Logging and debugging with configurable levels

## 📄 **License**

MIT License - see LICENSE file for details

## 🤝 **Contributing**

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request
