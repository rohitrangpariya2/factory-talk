import { createRateLimiter, requireAdminSecret } from './simpleSecurity';

function mockResponse() {
  const response: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader() {
      return this;
    }
  };
  return response;
}

describe('simple production safety middleware', () => {
  test('requires matching x-admin-secret header', () => {
    const middleware = requireAdminSecret(() => 'secret-123');
    const rejectedResponse = mockResponse();
    const acceptedResponse = mockResponse();
    const rejectedNext = jest.fn();
    const acceptedNext = jest.fn();

    middleware({ header: () => 'wrong' } as any, rejectedResponse, rejectedNext);
    middleware({ header: () => 'secret-123' } as any, acceptedResponse, acceptedNext);

    expect(rejectedResponse.statusCode).toBe(401);
    expect(rejectedResponse.body).toEqual({ error: 'Unauthorized' });
    expect(rejectedNext).not.toHaveBeenCalled();
    expect(acceptedNext).toHaveBeenCalledTimes(1);
  });

  test('rejects admin writes when ADMIN_SECRET is not configured', () => {
    const middleware = requireAdminSecret(() => '');
    const response = mockResponse();
    const next = jest.fn();

    middleware({ header: () => 'anything' } as any, response, next);

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  test('rate limiter blocks requests over the configured limit per client', () => {
    let now = 1_700_000_000_000;
    const middleware = createRateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
      now: () => now
    });
    const request = { ip: '10.0.0.5', header: () => undefined } as any;
    const first = mockResponse();
    const second = mockResponse();
    const third = mockResponse();
    const next = jest.fn();

    middleware(request, first, next);
    middleware(request, second, next);
    middleware(request, third, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(third.statusCode).toBe(429);
    expect(third.body).toEqual({ error: 'Too many requests' });

    now += 60_001;
    const afterWindow = mockResponse();
    middleware(request, afterWindow, next);
    expect(next).toHaveBeenCalledTimes(3);
  });
});
