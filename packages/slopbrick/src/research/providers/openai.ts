import type { GenerateOptions, ResearchProvider } from '../provider';

interface OpenAIChatCompletionResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
      refusal?: string | null;
    };
    finish_reason: string | null;
    index: number;
  }>;
}

export class OpenAiProvider implements ResearchProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateSample(prompt: string, options?: GenerateOptions): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      const snippet = body.length > 200 ? `${body.slice(0, 200)}...` : body;
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${snippet}`);
    }

    const data = (await response.json()) as OpenAIChatCompletionResponse;
    const content = data.choices[0]?.message?.content;

    if (typeof content !== 'string') {
      throw new Error('OpenAI API response did not contain assistant content');
    }

    return content;
  }
}

export default OpenAiProvider;
