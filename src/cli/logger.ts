import { Logger } from './types'

export class CliLogger implements Logger {
  constructor(
    private readonly verbose: boolean = false,
    private readonly silent: boolean = false
  ) {}

  public info(message: string, ...args: unknown[]): void {
    if (!this.silent) {
      console.log(this.formatMessage('INFO', message), ...args)
    }
  }

  public warn(message: string, ...args: unknown[]): void {
    if (!this.silent) {
      console.warn(this.formatMessage('WARN', message, '🟡'), ...args)
    }
  }

  public error(message: string, ...args: unknown[]): void {
    console.error(this.formatMessage('ERROR', message, '🔴'), ...args)
  }

  public debug(message: string, ...args: unknown[]): void {
    if (this.verbose && !this.silent) {
      console.debug(this.formatMessage('DEBUG', message, '🔍'), ...args)
    }
  }

  public success(message: string, ...args: unknown[]): void {
    if (!this.silent) {
      console.log(this.formatMessage('SUCCESS', message, '✅'), ...args)
    }
  }

  private formatMessage(level: string, message: string, emoji?: string): string {
    const timestamp = new Date().toISOString()
    const prefix = emoji ? `${emoji} ` : ''
    return `${prefix}[${timestamp}] [${level}] ${message}`
  }
}

export class SilentLogger implements Logger {
  public info(): void {
    // No-op
  }

  public warn(): void {
    // No-op
  }

  public error(message: string, ...args: unknown[]): void {
    // Still log errors even in silent mode
    console.error(message, ...args)
  }

  public debug(): void {
    // No-op
  }

  public success(): void {
    // No-op
  }
}