import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProvider, OpenAiProvider } from '../../src/research/provider';

describe('createProvider', () => {
  it('returns an OpenAiProvider for name openai', () => {
    const provider = createProvider({ name: 'openai', apiKey: 'test-key' });
    expect(provider).toBeInstanceOf(OpenAiProvider);
    expect(provider.name).toBe('openai');
  });

  it('throws for unknown provider name', () => {
    expect(() => createProvider({ name: 'unknown', apiKey: 'test-key' })).toThrow(
      'Unknown research provider: unknown',
    );
  });
});

describe('OpenAiProvider.generateSample', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('calls the OpenAI chat completions endpoint and returns assistant content', async () => {
    const provider = createProvider({ name: 'openai', apiKey: 'test-key', model: 'gpt-4o' });
    const generatedCode = 'export default function Example() { return <div />; }';

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [
          {
            message: { role: 'assistant', content: generatedCode },
            finish_reason: 'stop',
            index: 0,
          },
        ],
      }),
    });

    const result = await provider.generateSample('Generate a React component', {
      temperature: 0.5,
      maxTokens: 1000,
    });

    expect(result).toBe(generatedCode);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init?.method).toBe('POST');

    const headers = init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Authorization']).toBe('Bearer test-key');

    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe('gpt-4o');
    expect(body.messages).toEqual([{ role: 'user', content: 'Generate a React component' }]);
    expect(body.temperature).toBe(0.5);
    expect(body.max_tokens).toBe(1000);
  });

  it('uses the default model when not specified', async () => {
    const provider = createProvider({ name: 'openai', apiKey: 'test-key' });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [
          {
            message: { role: 'assistant', content: 'ok' },
            finish_reason: 'stop',
            index: 0,
          },
        ],
      }),
    });

    await provider.generateSample('prompt');

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe('gpt-4o-mini');
  });

  it('throws when the API returns a non-OK response', async () => {
    const provider = createProvider({ name: 'openai', apiKey: 'test-key' });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => '{"error": "invalid_api_key"}',
    });

    await expect(provider.generateSample('prompt')).rejects.toThrow(
      'OpenAI API error: 401 Unauthorized - {"error": "invalid_api_key"}',
    );
  });
});
