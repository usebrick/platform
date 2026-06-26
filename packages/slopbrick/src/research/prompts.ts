export interface PromptTemplate {
  framework: string;
  componentType: string;
  prompt: string;
}

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    framework: 'react',
    componentType: 'landing-page',
    prompt:
      'Generate a single-file React landing page component using Tailwind CSS. Include a hero section with a headline, subheadline, call-to-action button, and a feature grid. Use realistic placeholder text. Return only the code inside a code block.',
  },
  {
    framework: 'react',
    componentType: 'dashboard',
    prompt:
      'Generate a single-file React dashboard component using Tailwind CSS. Include a sidebar, header, stats cards, and a recent-activity table. Use realistic placeholder text. Return only the code inside a code block.',
  },
  {
    framework: 'vue',
    componentType: 'landing-page',
    prompt:
      'Generate a single-file Vue 3 landing page component using Tailwind CSS. Include a hero section with a headline, subheadline, call-to-action button, and a feature grid. Use realistic placeholder text. Return only the code inside a code block.',
  },
];

export function findTemplate(framework: string, componentType: string): PromptTemplate | undefined {
  return DEFAULT_PROMPT_TEMPLATES.find(
    (template) => template.framework === framework && template.componentType === componentType,
  );
}

export function renderPrompt(template: PromptTemplate): string {
  return template.prompt;
}
