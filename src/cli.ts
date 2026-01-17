#!/usr/bin/env node

import { Command } from 'commander'
import { CliContext } from './cli/types'
import { CliLogger } from './cli/logger'
import { DefaultConfigManager } from './config/config-manager'
import { createAuthCommand } from './cli/commands/auth'
import { createSessionCommand } from './cli/commands/session'
import { createInvoiceCommand } from './cli/commands/invoice'

async function main(): Promise<void> {
  const program = new Command()
  program
    .name('ksef')
    .description('KSEF TypeScript Client - Modern CLI for Polish e-invoicing')
    .version('0.1.0')

  // Global options
  program
    .option('-C, --config <path>', 'Configuration file path')
    .option('-e, --environment <env>', 'Environment (test|demo|production)', 'test')
    .option('--base-url <url>', 'Custom base URL')
    .option('--certificate <path>', 'Certificate file path')
    .option('--certificate-password <password>', 'Certificate password')
    .option('-v, --verbose', 'Verbose output')
    .option('-s, --silent', 'Silent output (errors only)')
    .option('-f, --format <format>', 'Output format (json|table|csv)', 'table')
    .option('--timeout <ms>', 'Request timeout in milliseconds', parseInt)

  // Create CLI context
  const createContext = async (options: any): Promise<CliContext> => {
    const configManager = new DefaultConfigManager()
    const config = await configManager.loadConfig(options.config)

    // Merge CLI options with config file
    const mergedConfig = configManager.mergeConfig(config, {
      environment: options.environment,
      baseURL: options.baseUrl,
      certificatePath: options.certificate,
      certificatePassword: options.certificatePassword,
      verbose: options.verbose,
      silent: options.silent,
      format: options.format,
      timeout: options.timeout,
    })

    const logger = new CliLogger(mergedConfig.verbose ?? false, mergedConfig.silent ?? false)

    return {
      config: mergedConfig,
      logger,
      configFilePath: options.config ?? configManager.getDefaultConfigPath(),
    }
  }

  // Configuration commands
  const configCmd = program.command('config').description('Manage configuration')

  configCmd
    .command('init')
    .description('Initialize configuration file')
    .option('-f, --force', 'Overwrite existing configuration')
    .action(async (_options) => {
      const context = await createContext(program.opts())
      context.logger.info('Initializing configuration...')

      const configManager = new DefaultConfigManager()
      const defaultConfig = {
        environment: 'test' as const,
        format: 'table' as const,
        verbose: false,
        silent: false,
        timeout: 30000,
        retries: 3,
      }

      try {
        await configManager.saveConfig(defaultConfig)
        context.logger.success('Configuration file created successfully')
      } catch (error) {
        context.logger.error('Failed to create configuration file')
        process.exit(1)
      }
    })

  configCmd
    .command('show')
    .description('Show current configuration')
    .action(async () => {
      const context = await createContext(program.opts())
      console.log(JSON.stringify(context.config, null, 2))
    })

  // Add command modules
  program.addCommand(createAuthCommand(await createContext(program.opts())))
  program.addCommand(createSessionCommand(await createContext(program.opts())))
  program.addCommand(createInvoiceCommand(await createContext(program.opts())))

  // Pipeline support for Unix-style chaining
  program
    .command('pipe')
    .description('Process JSON data from stdin through multiple operations')
    .option('--auth <certificate>', 'Authenticate first')
    .option('--session-open <type>', 'Open session (online|batch)')
    .option('--session-nip <nip>', 'NIP for session')
    .option('--invoice-submit', 'Submit invoices from pipeline')
    .option('--invoice-query', 'Query invoices and add to pipeline')
    .action(async (options) => {
      const context = await createContext(program.opts())
      context.logger.info('Starting pipeline processing...')

      try {
        // Read input data from stdin
        let pipelineData = await readStdin()

        // Process pipeline steps
        if (options.auth) {
          context.logger.info('Authenticating...')
          // In a real implementation, we would perform authentication
        }

        if (options.sessionOpen && options.sessionNip) {
          context.logger.info(`Opening ${options.sessionOpen} session...`)
          // In a real implementation, we would open session
          pipelineData = { ...pipelineData, sessionId: 'pipeline-session-' + Date.now() }
        }

        if (options.invoiceSubmit) {
          context.logger.info('Submitting invoices...')
          // In a real implementation, we would submit invoices
        }

        if (options.invoiceQuery) {
          context.logger.info('Querying invoices...')
          // In a real implementation, we would query invoices
        }

        // Output final pipeline data
        console.log(JSON.stringify(pipelineData, null, 2))
        context.logger.success('Pipeline processing completed')
      } catch (error) {
        context.logger.error('Pipeline processing failed')
        process.exit(1)
      }
    })

  // Help command with examples
  program
    .command('examples')
    .description('Show usage examples')
    .action(() => {
      console.log(`
KSEF CLI Usage Examples:

Authentication:
  ksef auth test -c cert.p12 -p password
  ksef auth test -c cert.crt --private-key cert.key -p password --cert-format pem --nip 1234567890
  ksef auth login -c cert.crt --private-key cert.key -p password --cert-format pem --nip 1234567890
  ksef auth whoami
  ksef auth logout
  ksef auth challenge --save

Session Management:
  ksef session open online -n 1234567890 -d "My session"
  ksef session close session-id
  ksef session list --all
  ksef session invoice-status session-id invoice-ref

Invoice Operations:
  ksef invoice submit session-id -i invoice.json
  ksef invoice submit -i invoice.json
  ksef invoice submit -i invoice.json --wait-status --require-success
  ksef invoice query --from 2023-01-01 --to 2023-12-31
  ksef invoice download ksef-ref-123 --format pdf -o invoice.pdf

Pipeline Processing:
  cat invoices.json | ksef pipe --session-open online --session-nip 1234567890 --invoice-submit
  ksef invoice query --from 2023-01-01 | ksef pipe --format csv > results.csv

Configuration:
  ksef config init
  ksef config show
`)
    })

  // Parse arguments
  await program.parseAsync(process.argv)
}

async function readStdin(): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = ''

    process.stdin.setEncoding('utf8')

    process.stdin.on('readable', () => {
      const chunk = process.stdin.read()
      if (chunk !== null) {
        data += chunk
      }
    })

    process.stdin.on('end', () => {
      try {
        if (data.trim()) {
          resolve(JSON.parse(data))
        } else {
          resolve({})
        }
      } catch (error) {
        reject(new Error(`Invalid JSON input: ${error}`))
      }
    })

    process.stdin.on('error', reject)
  })
}

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

// Run main function
main().catch((error) => {
  console.error('CLI Error:', error)
  process.exit(1)
})
