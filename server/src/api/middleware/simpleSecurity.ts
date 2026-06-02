import { NextFunction, Request, Response } from 'express';

type RateLimiterOptions = {
  windowMs: number;
  maxRequests: number;
  now?: () => number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

export function requireAdminSecret(getSecret: () => string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const expectedSecret = String(getSecret() || '').trim();
    const providedSecret = String(req.header('x-admin-secret') || '').trim();
    if (!expectedSecret || providedSecret !== expectedSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };
}

export function createRateLimiter(options: RateLimiterOptions) {
  const buckets = new Map<string, RateLimitBucket>();
  const now = options.now || (() => Date.now());

  return (req: Request, res: Response, next: NextFunction): void => {
    const timestamp = now();
    const key = clientKey(req);
    const bucket = buckets.get(key);

    if (!bucket || timestamp >= bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: timestamp + options.windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > options.maxRequests) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - timestamp) / 1000)));
      res.status(429).json({ error: 'Too many requests' });
      return;
    }

    next();
  };
}

function clientKey(req: Request): string {
  const forwardedFor = req.header('x-forwarded-for');
  const forwardedIp = forwardedFor ? forwardedFor.split(',')[0]?.trim() : '';
  return forwardedIp || req.ip || 'unknown';
}
