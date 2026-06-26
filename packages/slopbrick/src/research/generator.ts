import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ResearchProvider } from './provider';
import { findTemplate, renderPrompt } from './prompts';

export interface GeneratedSample {
  filePath: string;
  framework: string;
  componentType: string;
  provider: string;
  model?: string;
  timestamp: string;
}

export interface GenerateSamplesOptions {
  count: number;
  framework: string;
  componentType: string;
  provider: ResearchProvider;
  outputDir: string;
  temperature?: number;
}

export function extForFramework(framework: string): string {
  switch (framework) {
    case 'svelte':
      return '.svelte';
    case 'astro':
      return '.astro';
    case 'react':
    case 'vue':
    case 'solid':
    case 'qwik':
      return '.tsx';
    default:
      return '.tsx';
  }
}

export function extractCodeFromMarkdown(raw: string): string {
  const fenced = raw.match(/```(?:\w+)?\s*\n?([\s\S]*?)```/);
  if (fenced && fenced[1] !== undefined) {
    return fenced[1].trim();
  }
  return raw.trim();
}

export async function generateSamples(options: GenerateSamplesOptions): Promise<GeneratedSample[]> {
  const { count, framework, componentType, provider, outputDir, temperature } = options;
  const template = findTemplate(framework, componentType);

  if (!template) {
    const available = [findTemplate('react', 'landing-page'), findTemplate('react', 'dashboard'), findTemplate('vue', 'landing-page')]
      .filter(Boolean)
      .map((t) => `${t!.framework}/${t!.componentType}`);
    throw new Error(
      `No prompt template found for framework='${framework}', componentType='${componentType}'. Available templates: ${available.join(', ')}`,
    );
  }

  const samples: GeneratedSample[] = [];
  const ext = extForFramework(framework);
  const dir = join(outputDir, framework, componentType);
  mkdirSync(dir, { recursive: true });

  for (let i = 1; i <= count; i += 1) {
    const raw = await provider.generateSample(renderPrompt(template), { temperature });
    const code = extractCodeFromMarkdown(raw);
    const fileName = `sample-${i}${ext}`;
    const filePath = join(dir, fileName);
    writeFileSync(filePath, code, 'utf8');

    const sample: GeneratedSample = {
      filePath,
      framework,
      componentType,
      provider: provider.name,
      model: 'model' in provider ? (provider as { model?: string }).model : undefined,
      timestamp: new Date().toISOString(),
    };
    samples.push(sample);
  }

  const metadataPath = join(dir, 'metadata.json');
  writeFileSync(metadataPath, JSON.stringify(samples, null, 2), 'utf8');

  return samples;
}
