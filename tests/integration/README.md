# Integration Tests

This directory contains integration tests for the KSEF client. The tests can run in four modes:

## Test Modes

### 1. Mock Mode (Default)
Tests run against a local mock server that simulates KSEF API responses.

```bash
# Default mode - uses mocks
bun test tests/integration/

# Explicitly set mock mode
KSEF_TEST_MODE=mock bun test tests/integration/
```

### 2. Test Environment
Tests run against the real KSEF test environment (`https://api-test.ksef.mf.gov.pl`).

```bash
# Required environment variables
export KSEF_TEST_MODE=test
export KSEF_CERT_PEM_PATH=/path/to/your/test-certificate.pem
export KSEF_KEY_PEM_PATH=/path/to/your/private-key.pem
export KSEF_KEY_PASSPHRASE=your_key_passphrase
export KSEF_NIP=your_test_nip

# Optional environment variables
export KSEF_SKIP_CERT_VALIDATION=true  # Skip certificate validation (for self-signed certs)
export KSEF_TEST_TIMEOUT=60000         # Request timeout in milliseconds (default: 30000)
export KSEF_TEST_RETRIES=3             # Number of retries (default: 3)

# Run tests
bun test tests/integration/
```

### 3. Demo Environment
Tests run against the real KSEF demo environment (`https://api-demo.ksef.mf.gov.pl`).

```bash
# Required environment variables
export KSEF_TEST_MODE=demo
export KSEF_DEMO_BASE_URL=https://api-demo.ksef.mf.gov.pl
export KSEF_CERT_PEM_PATH=/path/to/your/demo-certificate.pem
export KSEF_KEY_PEM_PATH=/path/to/your/private-key.pem
export KSEF_KEY_PASSPHRASE=your_key_passphrase
export KSEF_NIP=your_demo_nip

# Run tests
bun test tests/integration/
```

### 4. Production Environment
Tests run against the real KSEF production environment (`https://api.ksef.mf.gov.pl`).

⚠️ **WARNING**: Only use this with valid production certificates and in controlled environments.

```bash
# Required environment variables
export KSEF_TEST_MODE=production
export KSEF_PROD_BASE_URL=https://api.ksef.mf.gov.pl
export KSEF_CERT_PEM_PATH=/path/to/your/prod-certificate.pem
export KSEF_KEY_PEM_PATH=/path/to/your/private-key.pem
export KSEF_KEY_PASSPHRASE=your_key_passphrase
export KSEF_NIP=your_production_nip

# Run tests (be very careful!)
bun test tests/integration/
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `KSEF_TEST_MODE` | No | `mock` | Test mode: `mock`, `test`, `demo`, or `production` |
| `KSEF_TEST_BASE_URL` | For test mode | `https://api-test.ksef.mf.gov.pl` | KSEF test environment URL |
| `KSEF_DEMO_BASE_URL` | For demo mode | `https://api-demo.ksef.mf.gov.pl` | KSEF demo environment URL |
| `KSEF_PROD_BASE_URL` | For production mode | `https://api.ksef.mf.gov.pl` | KSEF production environment URL |
| `KSEF_CERT_PEM_PATH` | For real services | - | Path to PEM certificate file |
| `KSEF_KEY_PEM_PATH` | For real services | - | Path to PEM private key file |
| `KSEF_KEY_PASSPHRASE` | For encrypted keys | - | Private key passphrase |
| `KSEF_NIP` | For real services | - | NIP (tax ID) for testing |
| `KSEF_SKIP_CERT_VALIDATION` | No | `false` | Skip certificate validation |
| `KSEF_TEST_TIMEOUT` | No | `30000` | Request timeout in milliseconds |
| `KSEF_TEST_RETRIES` | No | `3` | Number of request retries |
| `KSEF_MOCK_PORT` | No | Auto-assigned | Port for mock server |

## Test Files

### Standard Integration Tests (Mock Mode)
- `SessionIntegration.test.ts` - Session management tests
- `OnlineSessionIntegration.test.ts` - Online session tests
- `BatchIntegration.test.ts` - Batch processing tests
- `QueryInvoiceIntegration.test.ts` - Invoice query tests
- `AuthorizationIntegration.test.ts` - Authentication tests
- `CertificateIntegration.test.ts` - Certificate handling tests

### Real Service Integration Tests
- `SessionIntegration.realservice.test.ts` - Example real service tests

## Setting Up Real Service Testing

### 1. Obtain Test Certificate
You need a valid PEM certificate and private key for KSEF testing:
- Get a test certificate from the Polish Ministry of Finance
- Or use a self-signed certificate (with `KSEF_SKIP_CERT_VALIDATION=true`)

### 2. Configure Environment
Create a `.env.test` file:

```bash
# .env.test
KSEF_TEST_MODE=test
KSEF_CERT_PEM_PATH=./certificates/test-cert.pem
KSEF_KEY_PEM_PATH=./certificates/test-key.pem
KSEF_KEY_PASSPHRASE=your_password
KSEF_NIP=1234567890
KSEF_SKIP_CERT_VALIDATION=true
KSEF_TEST_TIMEOUT=60000
```

### 3. Load Environment and Run Tests
```bash
# Load environment variables
source .env.test

# Run specific real service test
bun test tests/integration/SessionIntegration.realservice.test.ts

# Run all integration tests with real service
bun test tests/integration/
```

## Creating Real Service Tests

To create new integration tests that work with real services:

```typescript
import { BaseIntegrationTest } from './base/BaseIntegrationTest'

export class MyRealServiceTest extends BaseIntegrationTest {
  public setupTests(): void {
    this.setupHooks()

    describe('My Real Service Tests', () => {
      it('should test real service', async () => {
        // Test implementation
        const nip = this.generateRandomNip() // Uses env NIP or generates random
        const auth = await this.authWithCustomNip(nip) // Uses env cert or generates test cert

        // Your test logic here...
      })
    })
  }
}

// Use environment-based configuration
export function setupMyRealServiceTests(): void {
  const tests = BaseIntegrationTest.createFromEnvironment(MyRealServiceTest)
  tests.setupTests()
}

// Conditional setup based on environment
if (process.env.KSEF_TEST_MODE && process.env.KSEF_TEST_MODE !== 'mock') {
  setupMyRealServiceTests()
}
```

## Best Practices

### Mock Mode
- Default for CI/CD pipelines
- Fast execution
- No external dependencies
- Good for testing client logic and error handling

### Test Environment
- Use for integration testing with real KSEF API
- Requires valid test certificates
- Slower execution
- Tests actual API behavior

### Production Environment
- Only for final validation
- Use with extreme caution
- Requires production certificates
- May incur costs or create real records

## Debugging

Enable debug logging:

```bash
export DEBUG=ksef:*
bun test tests/integration/
```

View configuration:
```bash
export KSEF_TEST_MODE=test
export KSEF_CERT_PEM_PATH=./test-cert.pem
export KSEF_KEY_PEM_PATH=./test-key.pem
bun test tests/integration/ --reporter=verbose
```

The test framework will log the configuration being used:

```
🧪 Integration Test Configuration:
   Mode: test
   Base URL: https://api-test.ksef.mf.gov.pl
   Timeout: 30000ms
   Retries: 3
   Certificate PEM: ✅ Configured
   Private Key PEM: ✅ Configured
   Test NIP: ✅ Configured
   Skip Cert Validation: No
```

## Troubleshooting

### Certificate Issues
- Ensure certificate file exists and is readable
- Verify certificate password is correct
- Check certificate validity dates
- Use `KSEF_SKIP_CERT_VALIDATION=true` for self-signed certificates

### Network Issues
- Increase timeout: `KSEF_TEST_TIMEOUT=60000`
- Check firewall/proxy settings
- Verify KSEF service availability

### Authentication Issues
- Verify NIP is correct and authorized
- Check certificate contains required key usage
- Ensure certificate is not expired

### Test Failures
- Check KSEF service status
- Verify test data doesn't conflict with existing records
- Review API error responses in test output
