import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '../utils/response';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * In-memory store for rate limiting.
 *
 * ARCHITECTURAL NOTE ON MULTI-INSTANCE ENVIRONMENTS:
 * This in-memory store is local to the current Node.js process.
 * If the application is deployed across multiple instances/containers (e.g. Kubernetes,
 * PM2 cluster, AWS ECS with multiple tasks), each instance maintains its own memory store.
 * For true global rate limiting in a distributed environment, replace or augment this
 * store with a distributed cache such as Redis (e.g., using sliding-window Redis scripts).
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

// Periodic garbage collection to remove expired entries and prevent memory leaks
let cleanupInterval: NodeJS.Timeout | null = null;
function startCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, 60 * 1000);
  cleanupInterval.unref(); // Prevent interval from holding the event loop open in tests
}
startCleanup();

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  statusCode?: number;
}

/**
 * Rate limiter middleware to mitigate brute-force enumeration on sensitive public endpoints.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const {
    windowMs,
    maxRequests,
    message = 'Quá nhiều yêu cầu tra cứu. Vui lòng thử lại sau ít phút.',
    statusCode = 429,
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const rawIp = req.ip || req.socket.remoteAddress || 'unknown';

    const now = Date.now();
    const entry = rateLimitStore.get(rawIp);

    if (!entry || now > entry.resetTime) {
      rateLimitStore.set(rawIp, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (entry.count >= maxRequests) {
      errorResponse(res, message, statusCode, 'RATE_LIMIT_EXCEEDED');
      return;
    }

    entry.count += 1;
    return next();
  };
}

/**
 * Reset rate limit cache - primarily for unit/integration tests
 */
export function resetRateLimitStore(): void {
  rateLimitStore.clear();
}
