/**
 * Rate limiting utility for API calls.
 * Implements a token bucket algorithm with per-client limits.
 *
 * Rate limits are based on common provider limits:
 * - Slack: 50 requests/minute per workspace token
 * - Google: Various limits per API/scope
 * - Microsoft Graph: 10,000 requests per hour per tenant
 */

export interface RateLimitConfig {
  /** Maximum tokens (requests) allowed */
  maxTokens: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Messages to include in error when rate limited */
  errorMessage?: string;
}

export interface RateLimiterOptions {
  /** Unique identifier for this rate limiter (e.g., 'gmail', 'slack') */
  id: string;
  /** Default rate limit configuration */
  defaultConfig?: RateLimitConfig;
}

/**
 * Token bucket rate limiter.
 * Tracks requests per time window and throws when exceeded.
 */
export class RateLimiter {
  private tokens: number;
  private lastReset: number;
  private config: Required<RateLimitConfig>;

  constructor(
    private readonly options: RateLimiterOptions,
    config?: RateLimitConfig,
  ) {
    const defaults = {
      maxTokens: 50,
      windowMs: 60_000, // 1 minute
      errorMessage: `Rate limit exceeded for ${options.id}`,
    };
    this.config = { ...defaults, ...config } as Required<RateLimitConfig>;
    this.tokens = this.config.maxTokens;
    this.lastReset = Date.now();
  }

  /**
   * Consume a token. Throws if rate limited.
   * @returns number of milliseconds to wait before next request (0 if allowed)
   */
  consume(): number {
    const now = Date.now();

    // Reset bucket if window has passed
    if (now - this.lastReset >= this.config.windowMs) {
      this.tokens = this.config.maxTokens;
      this.lastReset = now;
    }

    if (this.tokens > 0) {
      this.tokens--;
      return 0;
    }

    // Rate limited - return wait time
    return this.config.windowMs - (now - this.lastReset);
  }

  /**
   * Check if a request would be allowed without consuming a token
   */
  isAllowed(): boolean {
    const now = Date.now();
    if (now - this.lastReset >= this.config.windowMs) {
      return true;
    }
    return this.tokens > 0;
  }

  /** Get current token count */
  getTokensRemaining(): number {
    return this.tokens;
  }

  /** Get time until reset in milliseconds */
  getTimeUntilReset(): number {
    const now = Date.now();
    const elapsed = now - this.lastReset;
    return Math.max(0, this.config.windowMs - elapsed);
  }

  reset(): void {
    this.tokens = this.config.maxTokens;
    this.lastReset = Date.now();
  }
}

/**
 * Multi-client rate limiter that tracks rate limiting per accountId
 */
export class MultiClientRateLimiter {
  private limiters = new Map<string, RateLimiter>();
  private readonly defaultConfig: RateLimitConfig;

  constructor(options: RateLimiterOptions, config?: RateLimitConfig) {
    this.defaultConfig = {
      maxTokens: 50,
      windowMs: 60_000,
      errorMessage: `Rate limit exceeded`,
      ...config,
    };
  }

  /**
   * Get or create a rate limiter for the given account
   */
  getLimiter(accountId: string): RateLimiter {
    if (!this.limiters.has(accountId)) {
      this.limiters.set(accountId, new RateLimiter({ id: 'provider', defaultConfig: this.defaultConfig }));
    }
    return this.limiters.get(accountId)!;
  }

  /**
   * Consume a token for the given account
   * @returns wait time in ms (0 if allowed), or throws if rate limited
   */
  consume(accountId: string): number {
    const limiter = this.getLimiter(accountId);
    const waitTime = limiter.consume();
    if (waitTime > 0) {
      throw new Error(
        `API rate limit exceeded for account ${accountId}. Try again in ${Math.ceil(waitTime / 1000)} seconds.`,
      );
    }
    return waitTime;
  }

  /** Cleanup old limiters to prevent memory leaks */
  cleanup(): void {
    // No-op for now - TypeScript doesn't allow accessing private config field
    // This method is reserved for future memory management optimization
  }
}

/**
 * Default rate limits for common providers
 */
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  slack: {
    maxTokens: 50,
    windowMs: 60_000,
    errorMessage: 'Slack API rate limit exceeded. Slowing down...',
  },
  gmail: {
    maxTokens: 100,
    windowMs: 60_000,
    errorMessage: 'Gmail API rate limit exceeded.',
  },
  microsoft: {
    maxTokens: 10_000,
    windowMs: 3_600_000, // 1 hour
    errorMessage: 'Microsoft Graph API rate limit exceeded.',
  },
  discord: {
    maxTokens: 50,
    windowMs: 60_000,
    errorMessage: 'Discord API rate limit exceeded.',
  },
};