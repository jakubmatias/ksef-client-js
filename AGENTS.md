# KSEF TypeScript Client

## Project Overview

A modern TypeScript client library and CLI for Poland's KSEF (Krajowy System e-Faktur - National E-Invoice System). Provides certificate-based authentication, session management, invoice submission/validation/query operations, and cross-platform CLI with native executables.

**Status:** Phase 1 & 2 complete. NOT certified for production - use at own risk.

## Tech Stack

- **Language:** TypeScript 5.9+ (strict mode)
- **Runtime:** Node.js 18+, Bun 1.0+, Deno, browsers
- **Build:** tsup (library), Bun --compile (native CLI binaries)
- **Testing:** Vitest with 90% coverage target
- **Validation:** Zod schemas for runtime type safety
- **CLI:** Commander.js
- **Crypto:** node-forge, xmldsigjs, xadesjs, @peculiar/x509

## Project Structure

```
src/
├── auth/           # Authentication & X.509 certificate handling
├── builders/       # Fluent builder APIs (Invoice, Session, Auth)
├── cli/            # CLI commands (auth, session, invoice, config)
├── config/         # Configuration management
├── crypto/         # Encryption and XAdES signatures
├── http/           # HTTP client with rate limiting & retries
├── invoice/        # Invoice operations & XML building
├── session/        # Session management (online/batch)
├── types/          # TypeScript types and Zod schemas
├── utils/          # Utility functions
├── index.ts        # Library entry point
└── cli.ts          # CLI entry point

tests/
├── unit/           # Unit tests
├── integration/    # Integration tests (mocked)
└── mocks/          # Mock implementations

schemas/            # JSON schemas for FA2/FA3 invoices
examples/           # Usage examples
```

## Key Commands

```bash
# Development
bun install         # Install dependencies
bun run dev         # Watch mode
bun run build       # Build library (CJS + ESM)
bun run build:cli   # Build native CLI binaries

# Testing
bun run test        # Run all tests
bun run test:unit   # Unit tests only
bun run test:integration  # Integration tests
bun run test:coverage     # With coverage report

# Quality
bun run lint        # ESLint
bun run format      # Prettier
bun run typecheck   # TypeScript compiler check
```

## Architecture Patterns

1. **Builder Pattern:** Fluent builders for complex objects (AuthConfigBuilder, SessionBuilder, InvoiceBuilder)
2. **Interface-Based:** All services have interfaces for easy mocking
3. **Zod Validation:** All API responses validated at runtime
4. **CLI Context:** Central context with logger, config passed through commands

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Main library exports, KsefClient class |
| `src/cli.ts` | CLI entry point with Commander.js |
| `src/auth/authenticator.ts` | XAdES and legacy authentication flows |
| `src/session/session-manager.ts` | Session lifecycle management |
| `src/invoice/invoice-service.ts` | Invoice CRUD operations |
| `src/http/http-client.ts` | HTTP with rate limiting/retries |

## Environment Variables

```bash
KSEF_TEST_MODE=test
KSEF_CERT_PEM_PATH=./cert.crt
KSEF_KEY_PEM_PATH=./cert.key
KSEF_KEY_PASSPHRASE=<passphrase>
KSEF_NIP=<tax_id>
KSEF_DEBUG_AUTH=1          # Enable auth debug logging
KSEF_DEBUG_AUTH_XML=1      # Write signed XML to file
```

## Important Considerations

- **Security:** Handles X.509 certificates, XAdES signatures, symmetric encryption
- **XML Processing:** Extensive XML manipulation for invoices and digital signatures
- **Polish Tax System:** Deep integration with KSEF API specifications
- **Dual Auth:** Supports both XAdES (modern) and legacy authentication
- **Invoice Formats:** FA2 and FA3 formats with different schemas
