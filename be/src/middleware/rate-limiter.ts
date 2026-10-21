import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '../utils/response';

interface RateLimitRecord {
  timestamps: number[];
}

// In-memory sliding window store for application submission rate limiting
const ipRecords = new Map<string, RateLimitRecord>();

// Default: maximum 10 applications per IP per hour (3600 seconds)
const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS = 10;

// Periodic cleanup of stale IP records every 10 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRecords.entries()) {
    record.timestamps = record.timestamps.filter(t => now - t < WINDOW_MS);
    if (record.timestamps.length === 0) {
      ipRecords.delete(ip);
    }
  }
}, 10 * 60 * 1000);

if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

/**
 * Safely extracts client IP address without trusting arbitrary forged headers
 * unless Express trusted proxy configuration is explicitly active.
 */
export function getClientIp(req: Request): string {
  const trustProxy = req.app.get('trust proxy');
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      const first = forwarded.split(',')[0].trim();
      if (first) return normalizeIp(first);
    }
  }
  return normalizeIp(req.ip || req.socket.remoteAddress || '127.0.0.1');
}

function normalizeIp(ip: string): string {
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  if (ip === '::1') {
    return '127.0.0.1';
  }
  return ip;
}

/**
 * Checks if the given IP address is rate limited.
 */
export function checkRateLimit(ip: string, maxRequests = MAX_REQUESTS, windowMs = WINDOW_MS): {
  isLimited: boolean;
  remaining: number;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  let record = ipRecords.get(ip);
  if (!record) {
    record = { timestamps: [] };
    ipRecords.set(ip, record);
  }

  // Filter timestamps within sliding window
  record.timestamps = record.timestamps.filter(t => now - t < windowMs);

  if (record.timestamps.length >= maxRequests) {
    const oldest = record.timestamps[0];
    const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
    return {
      isLimited: true,
      remaining: 0,
      retryAfterSeconds: Math.max(retryAfterSeconds, 1),
    };
  }

  return {
    isLimited: false,
    remaining: maxRequests - record.timestamps.length,
    retryAfterSeconds: 0,
  };
}

/**
 * Records a successful submission timestamp for rate limit calculation
 */
export function recordRateLimitHit(ip: string): void {
  const now = Date.now();
  let record = ipRecords.get(ip);
  if (!record) {
    record = { timestamps: [] };
    ipRecords.set(ip, record);
  }
  record.timestamps.push(now);
}

/**
 * Rate limiting middleware for public job application submission (anti-spam)
 */
export function applicationRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const { isLimited, retryAfterSeconds } = checkRateLimit(ip);

  if (isLimited) {
    res.setHeader('Retry-After', retryAfterSeconds);
    errorResponse(
      res,
      'Bạn đã vượt quá số lần nộp hồ sơ cho phép từ địa chỉ này trong vòng một giờ. Vui lòng thử lại sau.',
      429,
      'RATE_LIMIT_EXCEEDED',
      { retryAfterSeconds }
    );
    return;
  }

  next();
}

/**
 * Helper for tests to reset in-memory rate limiting state
 */
export function resetRateLimiter(): void {
  ipRecords.clear();
}
