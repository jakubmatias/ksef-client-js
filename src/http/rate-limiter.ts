import { RateLimiter } from '@/types/http'

export class TokenBucketRateLimiter implements RateLimiter {
  private tokens: number
  private readonly maxTokens: number
  private readonly refillRate: number // tokens per second
  private lastRefill: number

  constructor(requestsPerSecond: number, burstSize?: number) {
    this.refillRate = requestsPerSecond
    this.maxTokens = burstSize ?? requestsPerSecond
    this.tokens = this.maxTokens
    this.lastRefill = Date.now()
  }

  public async canMakeRequest(): Promise<boolean> {
    this.refillTokens()
    return this.tokens >= 1
  }

  public async waitForSlot(): Promise<void> {
    while (!(await this.canMakeRequest())) {
      const waitTime = Math.max(100, 1000 / this.refillRate)
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
    this.tokens -= 1
  }

  private refillTokens(): void {
    const now = Date.now()
    const timePassed = (now - this.lastRefill) / 1000
    const tokensToAdd = timePassed * this.refillRate

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd)
    this.lastRefill = now
  }
}

export class NoOpRateLimiter implements RateLimiter {
  public async canMakeRequest(): Promise<boolean> {
    return true
  }

  public async waitForSlot(): Promise<void> {
    // No-op
  }
}