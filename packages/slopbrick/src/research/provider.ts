import { OpenAiProvider } from './providers/openai';

export { OpenAiProvider };

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface ResearchProvider {
  readonly name: string;
  generateSample(prompt: string, options?: GenerateOptions): Promise<string>;
}

export interface ProviderConfig {
  name: string;
  apiKey: string;
  model?: string;
}

export function createProvider(config: ProviderConfig): ResearchProvider {
  switch (config.name) {
    case 'openai':
      return new OpenAiProvider(config.apiKey, config.model);
    default:
      throw new Error(`Unknown research provider: ${config.name}`);
  }
}
