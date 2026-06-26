import { describe, expect, it } from 'vitest';
import { findTemplate, renderPrompt } from '../../src/research/prompts';

describe('findTemplate', () => {
  it('returns a template for a known framework and component type', () => {
    const template = findTemplate('react', 'landing-page');
    expect(template).toBeDefined();
    expect(template?.framework).toBe('react');
    expect(template?.componentType).toBe('landing-page');
    expect(template?.prompt).toContain('React landing page');
  });

  it('returns undefined for unknown framework and component type', () => {
    expect(findTemplate('unknown', 'x')).toBeUndefined();
  });
});

describe('renderPrompt', () => {
  it('returns the prompt string from a template', () => {
    const template = findTemplate('react', 'dashboard');
    expect(template).toBeDefined();
    expect(renderPrompt(template!)).toBe(template!.prompt);
  });
});
