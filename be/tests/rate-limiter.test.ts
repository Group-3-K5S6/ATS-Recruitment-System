
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
    createRateLimiter,
    resetRateLimitStore,
} from '../src/middleware/rate-limiter';

function createMockRequest(ip: string) {
    return {
        ip,
        socket: { remoteAddress: ip },
    } as Request;
}

function createMockResponse() {
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    } as unknown as Response;

    return res;
}

describe('Rate limiter middleware', () => {
    beforeEach(() => {
        resetRateLimitStore();
    });

    it('allows requests within the limit', () => {
        const limiter = createRateLimiter({
            windowMs: 60_000,
            maxRequests: 2,
        });
        const next = vi.fn() as NextFunction;

        limiter(createMockRequest('192.0.2.1'), createMockResponse(), next);
        limiter(createMockRequest('192.0.2.1'), createMockResponse(), next);

        expect(next).toHaveBeenCalledTimes(2);
    });

    it('rejects requests exceeding the limit with HTTP 429', () => {
        const limiter = createRateLimiter({
            windowMs: 60_000,
            maxRequests: 2,
        });
        const next = vi.fn() as NextFunction;
        const ip = '192.0.2.2';

        limiter(createMockRequest(ip), createMockResponse(), next);
        limiter(createMockRequest(ip), createMockResponse(), next);

        const res = createMockResponse();
        limiter(createMockRequest(ip), res, next);

        expect(next).toHaveBeenCalledTimes(2);
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.json).toHaveBeenCalled();
    });

    it('tracks different IP addresses independently', () => {
        const limiter = createRateLimiter({
            windowMs: 60_000,
            maxRequests: 1,
        });
        const next = vi.fn() as NextFunction;

        limiter(createMockRequest('192.0.2.3'), createMockResponse(), next);
        limiter(createMockRequest('192.0.2.4'), createMockResponse(), next);

        expect(next).toHaveBeenCalledTimes(2);
    });
});
