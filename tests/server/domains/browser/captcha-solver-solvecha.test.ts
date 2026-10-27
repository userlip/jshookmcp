import { parseJson } from '@tests/server/domains/shared/mock-factories';
import type { BrowserStatusResponse } from '@tests/shared/common-test-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleCaptchaVisionSolve,
  handleWidgetChallengeSolve,
} from '@server/domains/browser/handlers/captcha-solver';

function createMockCollector() {
  const page = {
    evaluate: vi.fn(),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('test')),
    url: vi.fn(() => 'http://test.local/page'),
  };
  return { getActivePage: vi.fn().mockResolvedValue(page) } as any;
}

describe('captcha-solver solvecha (image only)', () => {
  let origFetch: typeof fetch | undefined;
  let origProvider: string | undefined;
  let origKey: string | undefined;

  beforeEach(() => {
    origFetch = globalThis.fetch;
    origProvider = process.env.CAPTCHA_PROVIDER;
    origKey = process.env.CAPTCHA_API_KEY;
    delete process.env.CAPTCHA_PROVIDER;
    delete process.env.CAPTCHA_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = origFetch as typeof fetch;
    if (origProvider === undefined) delete process.env.CAPTCHA_PROVIDER;
    else process.env.CAPTCHA_PROVIDER = origProvider;
    if (origKey === undefined) delete process.env.CAPTCHA_API_KEY;
    else process.env.CAPTCHA_API_KEY = origKey;
  });

  it('solves an image captcha when createTask returns ready', async () => {
    const calls: Array<{ url: string; body: any }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return {
        json: async () => ({
          errorId: 0,
          taskId: 'abc',
          status: 'ready',
          solution: { text: 'x7k2p' },
        }),
      } as any;
    }) as typeof fetch;

    const result = parseJson<BrowserStatusResponse>(
      await handleCaptchaVisionSolve(
        { provider: 'solvecha', apiKey: 'dummy', taskKind: 'image', imageBase64: 'dGVzdA==' },
        createMockCollector(),
      ),
    );

    expect(result.success).toBe(true);
    expect(result.token).toBe('x7k2p');
    expect(result.challengeType).toBe('image');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.solvecha.com/createTask');
    expect(calls[0]?.body.task).toEqual({ type: 'ImageToTextTask', body: 'dGVzdA==' });
  });

  it('polls getTaskResult when createTask returns a processing task', async () => {
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      return {
        json: async () =>
          url.endsWith('/createTask')
            ? { errorId: 0, taskId: 't1', status: 'processing' }
            : { errorId: 0, status: 'ready', solution: { text: 'abcd' } },
      } as any;
    }) as typeof fetch;

    const result = parseJson<BrowserStatusResponse>(
      await handleCaptchaVisionSolve(
        {
          provider: 'solvecha',
          apiKey: 'dummy',
          taskKind: 'image',
          imageBase64: 'dGVzdA==',
          timeoutMs: 10000,
        },
        createMockCollector(),
      ),
    );

    expect(result.success).toBe(true);
    expect(result.token).toBe('abcd');
    expect(urls).toEqual([
      'https://api.solvecha.com/createTask',
      'https://api.solvecha.com/getTaskResult',
    ]);
  });

  it('keeps the API error description', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        ({
          json: async () => ({
            errorId: 1,
            errorCode: 'ERROR_KEY_DOES_NOT_EXIST',
            errorDescription: 'Account authorization key not found in the system',
          }),
        }) as any,
    ) as typeof fetch;

    const result = parseJson<BrowserStatusResponse>(
      await handleCaptchaVisionSolve(
        {
          provider: 'solvecha',
          apiKey: 'dummy',
          taskKind: 'image',
          imageBase64: 'dGVzdA==',
          maxRetries: 0,
        },
        createMockCollector(),
      ),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Account authorization key not found in the system');
  });

  it.each(['recaptcha_v2', 'hcaptcha', 'turnstile', 'funcaptcha'])(
    'rejects %s in captcha_vision_solve before any request',
    async (taskKind) => {
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const result = parseJson<BrowserStatusResponse>(
        await handleCaptchaVisionSolve(
          { provider: 'solvecha', apiKey: 'dummy', taskKind, siteKey: 'sk' },
          createMockCollector(),
        ),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Solvecha only solves image captchas');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('rejects widget challenges before any request', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = parseJson<BrowserStatusResponse>(
      await handleWidgetChallengeSolve(
        {
          mode: 'external_service',
          provider: 'solvecha',
          apiKey: 'dummy',
          siteKey: 'sk',
          taskKind: 'turnstile',
        },
        createMockCollector(),
      ),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Solvecha only solves image captchas');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
