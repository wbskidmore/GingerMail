/**
 * Rate limiting configuration for GingerMail.
 * 
 * This module provides configurable rate limits that can be overridden
 * via environment variables for deployment-specific tuning.
 */

export interface RateLimitSettings {
  /** Maximum API requests per minute (default: 50) */
  requestsPerMinute: number;
  /** Whether rate limiting is enabled (default: true) */
  enabled: boolean;
  /** Whether to apply rate limiting to background sync operations */
  backgroundSync?: boolean;
}

/**
 * Default rate limits aligned with provider documentation:
 * - Slack: 50 requests/minute per workspace token
 * - Google: Varies by API (handled by googleapis library)
 * - Microsoft Graph: 10,000/hour per tenant
 */
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitSettings> = {
  slack: {
    requestsPerMinute: 50,
    enabled: true,
  },
  discord: {
    requestsPerMinute: 50,
    enabled: true,
  },
  // Note: Gmail/Google uses the googleapis library which has built-in rate limiting
  // Microsoft Graph uses the msal library which has its own retry logic
};

/**
 * Read rate limit configuration from environment variables.
 * Format: GM_RATE_LIMIT_<PROVIDER>=<requests_per_minute>
 * Examples:
 *   GM_RATE_LIMIT_SLACK=100
 *   GM_RATE_LIMIT_DISCORD=25
 */
export function getRateLimitConfig(provider: string): RateLimitSettings {
  const envKey = `GM_RATE_LIMIT_${provider.toUpperCase()}`;
  const envValue = process.env[envKey];
  
  if (envValue !== undefined) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return {
        requestsPerMinute: parsed,
        enabled: true,
      };
    }
  }
  
  return DEFAULT_RATE_LIMITS[provider as keyof typeof DEFAULT_RATE_LIMITS] 
    ?? { requestsPerMinute: 40, enabled: true }; // Conservative default
}

/**
 * Check if rate limiting is enabled for a provider
 */
export function isRateLimitingEnabled(provider: string): boolean {
  const envKey = `GM_RATE_LIMIT_${provider.toUpperCase()}_ENABLED`;
  const envValue = process.env[envKey];
  
  if (envValue !== undefined) {
    return envValue.toLowerCase() !== 'false' && envValue !== '0';
  }
  
  return getRateLimitConfig(provider).enabled;
}

/**
 * Get rate limit tokens per window for use with RateLimiter
 */
export function getRateLimitTokens(provider: string): {
  maxTokens: number;
  windowMs: number;
} {
  const config = getRateLimitConfig(provider);
  return {
    maxTokens: config.requestsPerMinute,
    windowMs: 60_000, // 1 minute window
  };
}