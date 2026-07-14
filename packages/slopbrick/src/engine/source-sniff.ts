/** Pure content sniffer shared by discovery and parser-backed fact eligibility. */
export function sniffSourceExtension(source: string | Uint8Array): string | null {
  const bytes = typeof source === 'string' ? Buffer.from(source, 'utf8') : Buffer.from(source);
  const head = bytes.subarray(0, 512).toString('utf8').replace(/^\uFEFF/, '');

  if (/<template[\s>]/i.test(head) && /<script[\s>]/i.test(head)) return '.vue';
  if (/^<script\s+setup/i.test(head)) return '.vue';
  if (/<script[\s>]/i.test(head) && /let\s+\w+\s*:\s*\w+/i.test(head)) return '.svelte';
  if (/^---\s*$/m.test(head) && /<\/?[A-Za-z][\w.:-]*[\s>]/m.test(head)) return '.astro';
  if (/^<!doctype\s+html/i.test(head) || /^<html[\s>]/i.test(head)) return '.html';
  if (/<[A-Z][\w.]*[\s/>]/.test(head) && /\bimport\s+/.test(head)) return '.tsx';
  if (/\b(interface\s+\w+|type\s+\w+\s*=)\b/.test(head)) return '.ts';
  if (/^(import|export)\s+/m.test(head) || /\b(const|let|var)\s+\w+\s*=/.test(head)) return '.js';
  return null;
}
